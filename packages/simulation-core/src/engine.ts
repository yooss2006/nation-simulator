import { z } from "zod";
import type { World, Command, Metrics } from "../../contracts/src/index";
import { RULES } from "../../game-data/src/index";
import { event, transfer, assertInvariants, inventory } from "./accounting";
import { random } from "./random";
import { elections } from "./politics";
const commandSchema = z
  .object({
    id: z.string().min(1).max(100),
    turn: z.number().int().nonnegative(),
    expectedRevision: z.number().int().nonnegative(),
    actorId: z.literal("president"),
    kind: z.enum(["tax", "project", "diplomacy", "bond"]),
    payload: z
      .object({
        value: z.number().finite().optional(),
        target: z.string().max(100).optional(),
        project: z.enum(["road", "hospital", "school"]).optional(),
      })
      .strict(),
  })
  .strict();
const min = (a: bigint, b: bigint) => (a < b ? a : b);
function apply(w: World, input: Command): void {
  const c = commandSchema.parse(input);
  if (c.turn !== w.turn || c.expectedRevision !== w.revision)
    throw Error("명령의 턴 또는 리비전이 현재 상태와 다릅니다");
  if (w.commands.some((x) => x.id === c.id)) throw Error("중복 명령");
  const cause = event(w, "command", `${c.kind} 명령 접수`, [], [c.id]);
  if (c.kind === "tax") {
    const tax = c.payload.value;
    if (
      tax === undefined ||
      !Number.isInteger(tax) ||
      tax < 0 ||
      tax > RULES.maxTax
    )
      throw Error("소득세는 0~50% 정수여야 합니다");
    if (w.laws.some((l) => l.effectiveTurn === w.turn + 1))
      throw Error("이번 달 소득세 법안이 이미 접수됐습니다");
    const yes = w.parties.reduce(
      (n, p, i) =>
        n +
        (i === 0 || Math.abs(tax - (25 - p.ideology[0] * 20)) <= 15
          ? p.seats
          : 0),
      0,
    );
    w.laws.push({
      id: c.id,
      tax,
      status: yes >= 6 ? "passed" : "rejected",
      effectiveTurn: w.turn + 1,
      yes,
      no: 11 - yes,
    });
    event(
      w,
      "law",
      `소득세 ${tax}% 법안 ${yes >= 6 ? "가결, 다음 달 시행" : "부결"} (찬성 ${yes} / 반대 ${11 - yes})`,
      [],
      [cause],
    );
  } else if (c.kind === "project") {
    const p = w.parcels.find((p) => p.id === c.payload.target);
    if (
      !p ||
      p.terrain === "water" ||
      p.building ||
      w.projects.some((x) => x.parcelId === p.id)
    )
      throw Error("비어 있는 육지 필지를 선택하세요");
    if (!c.payload.project) throw Error("사업 종류 필요");
    const contractor = w.companies.find(
      (f) => f.sector === "materials" && f.active,
    );
    if (!contractor) throw Error("시공 기업이 없습니다");
    transfer(w, "treasury", contractor.accountId, RULES.projectCost, cause);
    w.projects.push({
      id: c.id,
      parcelId: p.id,
      kind: c.payload.project,
      remaining: RULES.projectMonths,
      cost: RULES.projectCost,
      complete: false,
    });
  } else if (c.kind === "diplomacy") {
    const n = w.neighbors.find((n) => n.id === c.payload.target);
    if (!n) throw Error("국가를 찾을 수 없습니다");
    if (n.tradeAgreement) throw Error("이미 무역 협정이 있습니다");
    transfer(w, "treasury", "foreign", 50000n, cause);
    n.relation += 20;
    n.tradeAgreement = true;
    event(w, "treaty", `${n.name}과 무역 협정 체결`, [n.id], [cause]);
  } else {
    const amount = c.payload.value;
    if (
      amount === undefined ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > 10000000
    )
      throw Error("국채 규모는 1~10,000,000 최소 화폐 단위");
    transfer(w, "bank", "treasury", BigInt(amount), cause);
    w.governmentDebt += BigInt(amount);
    w.loans.push({
      id: c.id,
      borrower: "treasury",
      principal: BigInt(amount),
      remaining: 24,
      rateBps: w.policyRateBps,
    });
  }
  w.commands.push(c);
}
function economy(w: World, m: Metrics): void {
  const active = w.citizens.filter(
    (c) => c.alive && c.ageMonths >= 216 && c.ageMonths < 780,
  );
  for (const c of w.citizens) c.employerId = null;
  let available = 0;
  for (const f of w.companies) {
    f.employees = [];
    if (!f.active) continue;
    const affordable = Number(
      min(w.accounts[f.id] / f.wage, BigInt(f.capacity)),
    );
    for (let i = 0; i < affordable && available < active.length; i++) {
      const c = active[available++];
      c.employerId = f.id;
      f.employees.push(c.id);
      const tax = (f.wage * BigInt(w.incomeTax)) / 100n;
      const e = event(w, "wage", `${f.name} 임금 지급`, [f.id, c.id]);
      transfer(w, f.id, c.householdId, f.wage - tax, e);
      transfer(w, f.id, "treasury", tax, e);
      m.tax += tax;
    }
    const produced = Math.floor(
      f.employees.length * (f.sector === "food" ? 7 : 2) * w.infrastructure,
    );
    const pe = event(w, "production", `${f.name}: ${produced} 단위 생산`, [
      f.id,
    ]);
    inventory(w, f.id, produced, pe);
  }
  const citizenIndex = new Map(w.citizens.map((c) => [c.id, c]));
  const foods = w.companies.filter((f) => f.sector === "food" && f.active);
  for (const h of w.households) {
    const count = h.memberIds.filter(
      (id) => citizenIndex.get(id)?.alive,
    ).length;
    if (count === 0) continue;
    const need = count * RULES.foodPerPerson;
    let bought = 0;
    for (const f of [...foods].sort((a, b) =>
      a.price < b.price
        ? -1
        : a.price > b.price
          ? 1
          : a.id < b.id
            ? -1
            : a.id > b.id
              ? 1
              : 0,
    )) {
      const qty = Math.min(
        need - bought,
        f.inventory,
        Number(min(w.accounts[h.id] / f.price, BigInt(need))),
      );
      if (qty <= 0) continue;
      const value = BigInt(qty) * f.price;
      const e = event(w, "consumption", `${h.id}: 식량 ${qty} 구입`, [
        h.id,
        f.id,
      ]);
      transfer(w, h.id, f.id, value, e);
      inventory(w, f.id, -qty, e);
      bought += qty;
      m.consumption += value;
      m.gdp += value;
    }
    if (bought < need) {
      const n = w.neighbors
        .filter((n) => n.tradeAgreement)
        .sort((a, b) => Number(a.foodPrice - b.foodPrice))[0];
      if (n) {
        const price = BigInt(Math.round(Number(n.foodPrice) * n.exchangeRate));
        const qty = Math.min(
          need - bought,
          Number(min(w.accounts[h.id] / price, BigInt(need))),
        );
        if (qty > 0) {
          const e = event(w, "import", `${n.name}에서 식량 ${qty} 수입`, [
            h.id,
            n.id,
          ]);
          transfer(w, h.id, "foreign", BigInt(qty) * price, e);
          bought += qty;
          m.consumption += BigInt(qty) * price;
        }
      }
    }
    h.food = bought;
    h.satisfaction = Math.max(
      0,
      Math.min(100, h.satisfaction * 0.85 + (15 * bought) / need),
    );
    if (bought < need && w.accounts.treasury >= 1000n) {
      const e = event(w, "relief", `${h.id} 긴급 생활지원`, [h.id]);
      transfer(w, "treasury", h.id, 1000n, e);
    }
  }
  for (const f of foods) {
    const old = f.inventory;
    const waste = Math.floor(old * 0.1);
    if (waste) {
      const e = event(w, "waste", `${f.name}: 식량 ${waste} 폐기`, [f.id]);
      inventory(w, f.id, -waste, e);
    }
    f.price =
      f.inventory === 0 ? (f.price * 103n) / 100n : (f.price * 98n) / 100n;
    if (f.price < 100n) f.price = 100n;
    if (f.price > 100000n) f.price = 100000n;
  }
  // Services/materials are purchased only within the public procurement budget.
  for (const f of w.companies.filter((f) => f.sector !== "food" && f.active)) {
    const qty = Math.min(
      f.inventory,
      Number(min(w.accounts.treasury / 10n / f.price, 100n)),
    );
    if (qty) {
      const e = event(w, "procurement", `${f.name}: 공공조달 ${qty}`, [f.id]);
      transfer(w, "treasury", f.id, BigInt(qty) * f.price, e);
      inventory(w, f.id, -qty, e);
      m.gdp += BigInt(qty) * f.price;
    }
  }
  for (const f of w.companies) {
    if (w.accounts[f.id] < f.wage && f.inventory === 0) {
      f.active = false;
      event(w, "bankruptcy", `${f.name} 영업 중단`, [f.id]);
    }
  }
  m.employed = available;
  m.laborForce = active.length;
  m.unemployment = active.length ? (1 - available / active.length) * 100 : 0;
  m.priceIndex = foods.length
    ? (Number(foods.reduce((n, f) => n + f.price, 0n) / BigInt(foods.length)) *
        100) /
      Number(RULES.foodPrice)
    : 100;
  m.approval =
    w.households.reduce((n, h) => n + h.satisfaction, 0) / w.households.length;
}
function population(w: World, m: Metrics): void {
  const rand = () => random(w.rng, w.seed, "demography");
  const initial = w.citizens.length;
  for (let i = 0; i < initial; i++) {
    const c = w.citizens[i];
    if (!c.alive) continue;
    c.ageMonths++;
    if (rand() < (c.ageMonths > 900 ? 0.008 : 0.00015)) {
      c.alive = false;
      c.employerId = null;
      m.deaths++;
      event(w, "death", `${c.id} 사망`, [c.id]);
    }
  }
  const births = Math.floor(
    w.citizens.filter(
      (c) => c.alive && c.ageMonths >= 240 && c.ageMonths <= 480,
    ).length *
      0.0015 +
      rand(),
  );
  for (let i = 0; i < births; i++) {
    const homes = w.households.filter((h) =>
      h.memberIds.some((id) => w.citizens.find((c) => c.id === id)?.alive),
    );
    if (!homes.length) break;
    const h = homes[Math.floor(rand() * homes.length)];
    const id = `c${w.citizens.length}`;
    w.citizens.push({
      id,
      householdId: h.id,
      ageMonths: 0,
      education: 0,
      health: 100,
      preference: [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1],
      employerId: null,
      alive: true,
    });
    h.memberIds.push(id);
    m.births++;
    event(w, "birth", `${h.id} 출생`, [id, h.id]);
  }
  m.population = w.citizens.filter((c) => c.alive).length;
}
function finance(w: World): void {
  for (const l of w.loans) {
    if (l.principal === 0n) continue;
    const due = (l.principal * BigInt(l.rateBps)) / 120000n;
    const interest = min(w.accounts[l.borrower], due);
    const e = event(w, "interest", "국채 이자 및 원금 상환", [l.id]);
    transfer(w, l.borrower, "bank", interest, e);
    w.bankCapital += interest;
    l.remaining--;
    if (l.remaining <= 0) {
      const paid = min(w.accounts[l.borrower], l.principal);
      transfer(w, l.borrower, "bank", paid, e);
      l.principal -= paid;
      w.governmentDebt -= paid;
      if (l.principal > 0n) {
        l.remaining = 12;
        event(w, "debt-rollover", "만기 국채 미상환분 12개월 연장", [l.id]);
      }
    }
  }
  const last = w.history.at(-1);
  if (last) {
    const inflation =
      (w.metrics.priceIndex / Math.max(1, last.priceIndex) - 1) * 100;
    w.policyRateBps = Math.max(
      0,
      Math.min(
        2500,
        w.policyRateBps + (inflation > 1 ? 25 : inflation < 0 ? -25 : 0),
      ),
    );
  }
}
export function advanceMonth(original: World, commands: Command[] = []): World {
  if (original.status === "ended")
    throw Error("종료된 국가는 진행할 수 없습니다");
  const w = structuredClone(original);
  w.events = [];
  w.journal = [];
  w.inventoryOpening = Object.fromEntries(
    w.companies.map((f) => [f.id, f.inventory]),
  );
  w.inventoryLedger = [];
  for (const c of commands) apply(w, c);
  w.turn++;
  w.revision++;
  for (const law of w.laws)
    if (law.status === "passed" && law.effectiveTurn === w.turn) {
      w.incomeTax = law.tax;
      event(w, "law-effective", `소득세 ${law.tax}% 시행`, [law.id]);
    }
  const m: Metrics = {
    turn: w.turn,
    population: 0,
    employed: 0,
    laborForce: 0,
    unemployment: 0,
    gdp: 0n,
    consumption: 0n,
    tax: 0n,
    priceIndex: 100,
    approval: 0,
    births: 0,
    deaths: 0,
    immigrants: 0,
    emigrants: 0,
  };
  population(w, m);
  economy(w, m);
  w.metrics = m;
  finance(w);
  for (const p of w.projects)
    if (!p.complete) {
      p.remaining--;
      if (p.remaining === 0) {
        p.complete = true;
        w.parcels.find((x) => x.id === p.parcelId)!.building =
          p.kind === "road" ? "road" : "civic";
        w.infrastructure += 0.02;
        event(w, "project-complete", `${p.kind} 공공사업 준공`, [
          p.id,
          p.parcelId,
        ]);
      }
    }
  for (const n of w.neighbors) {
    const delta = (random(w.rng, w.seed, "foreign") - 0.5) * 0.04;
    n.exchangeRate = Math.max(0.2, Math.min(5, n.exchangeRate + delta));
  }
  elections(w);
  w.history.push(m);
  if (w.history.length > 1200) w.history.shift();
  assertInvariants(w);
  return w;
}
