import type {
  World,
  Difficulty,
  Ideology,
  Metrics,
} from "../../contracts/src/index";
import { ENDOWMENTS, PARTY_NAMES, RULES } from "../../game-data/src/index";
import { random } from "../../simulation-core/src/random";
export function generateWorld(
  seed = 2026,
  difficulty: Difficulty = "normal",
  ideology: Ideology = [0, 0, 0],
): World {
  if (
    !Number.isSafeInteger(seed) ||
    !ENDOWMENTS[difficulty] ||
    ideology.length !== 3 ||
    ideology.some((v) => !Number.isFinite(v) || Math.abs(v) > 1)
  )
    throw Error("잘못된 세계 생성 설정");
  const d = ENDOWMENTS[difficulty];
  const metrics: Metrics = {
    turn: 0,
    population: 1000,
    employed: 0,
    laborForce: 0,
    unemployment: 0,
    gdp: 0n,
    consumption: 0n,
    tax: 0n,
    priceIndex: 100,
    approval: 60,
    births: 0,
    deaths: 0,
    immigrants: 0,
    emigrants: 0,
  };
  const w: World = {
    schemaVersion: 1,
    engineVersion: "0.1.0",
    ruleVersion: "0.1.0",
    seed,
    turn: 0,
    revision: 0,
    difficulty,
    ideology,
    status: "running",
    endReason: null,
    rng: {},
    citizens: [],
    households: [],
    companies: [],
    parcels: [],
    accounts: { treasury: d.cash, bank: d.cash, foreign: 100000000n },
    parties: [],
    laws: [],
    projects: [],
    neighbors: [],
    loans: [],
    incomeTax: 15,
    policyRateBps: 300,
    governmentDebt: 0n,
    bankCapital: d.cash,
    bankDeposits: 0n,
    moneySupply: 0n,
    infrastructure: d.infrastructure,
    inventoryOpening: {},
    inventoryLedger: [],
    journal: [],
    events: [],
    commands: [],
    history: [],
    metrics,
    presidentTerms: 1,
  };
  const rnd = (name: string) => random(w.rng, seed, name);
  for (let i = 0; i < 250; i++) {
    const id = `h${i}`;
    w.accounts[id] = 80000n;
    w.households.push({
      id,
      memberIds: [],
      accountId: id,
      food: 0,
      satisfaction: 60,
    });
    for (let j = 0; j < 4; j++) {
      const cid = `c${i * 4 + j}`;
      w.households[i].memberIds.push(cid);
      w.citizens.push({
        id: cid,
        householdId: id,
        ageMonths: (j < 2 ? 24 : 4) * 12 + Math.floor(rnd("population") * 240),
        education: Math.floor(rnd("population") * 4),
        health: 90,
        preference: [
          rnd("politics") * 2 - 1,
          rnd("politics") * 2 - 1,
          rnd("politics") * 2 - 1,
        ],
        employerId: null,
        alive: true,
      });
    }
  }
  for (let i = 0; i < 12; i++) {
    const id = `f${i}`;
    w.accounts[id] = d.cash / 12n;
    const sector = i < 8 ? "food" : i < 10 ? "materials" : "services";
    w.companies.push({
      id,
      name: `${["들녘", "한빛", "푸른", "새봄"][i % 4]} ${sector === "food" ? "농업" : sector === "materials" ? "공업" : "서비스"} ${i + 1}`,
      sector,
      accountId: id,
      employees: [],
      inventory: 0,
      price: RULES.foodPrice,
      wage: RULES.wage,
      capacity: d.capacity,
      active: true,
    });
  }
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const r = rnd("geography");
      const terrain =
        x < 2 || y > 13
          ? "water"
          : r < 0.18
            ? "forest"
            : r > 0.88
              ? "hill"
              : "plain";
      let building: World["parcels"][number]["building"] = null;
      if (terrain === "plain") {
        if (y === 7) building = "road";
        else if (x > 5 && x < 11 && y > 4 && y < 10) building = "housing";
        else if (r < 0.5) building = "farm";
      }
      w.parcels.push({
        id: `p${x}-${y}`,
        x,
        y,
        terrain,
        resource: Math.floor(rnd("geography") * 100),
        building,
      });
    }
  w.parties = PARTY_NAMES.map((name, i) => ({
    id: `party${i}`,
    name,
    ideology:
      i === 0
        ? ideology
        : ([
            i === 1 ? 0.8 : -0.6,
            i === 2 ? -0.7 : 0.5,
            i === 3 ? 0.9 : -0.2,
          ] as Ideology),
    seats: [5, 3, 2, 1][i],
    votes: 0,
  }));
  w.neighbors = ["노르덴", "해온", "벨라"].map((name, i) => ({
    id: `n${i}`,
    name,
    population: 1000000 + i * 500000,
    relation: 0,
    foodPrice: 650n + BigInt(i * 80),
    exchangeRate: 1,
    tradeAgreement: false,
  }));
  w.inventoryOpening = Object.fromEntries(w.companies.map((f) => [f.id, 0]));
  w.moneySupply = Object.values(w.accounts).reduce((a, b) => a + b, 0n);
  w.metrics.laborForce = w.citizens.filter(
    (c) => c.ageMonths >= 216 && c.ageMonths < 780,
  ).length;
  w.metrics.unemployment = 100;
  return w;
}
