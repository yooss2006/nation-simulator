import type { World } from "../../contracts/src/index";
export function event(
  w: World,
  type: string,
  message: string,
  subjectIds: string[] = [],
  causeIds: string[] = [],
): string {
  const id = `e${w.turn}-${w.events.length}`;
  w.events.push({ id, turn: w.turn, type, message, subjectIds, causeIds });
  return id;
}
export function transfer(
  w: World,
  from: string,
  to: string,
  amount: bigint,
  causeEventId: string,
): void {
  if (
    amount < 0n ||
    w.accounts[from] === undefined ||
    w.accounts[to] === undefined
  )
    throw Error("유효하지 않은 거래");
  if (w.accounts[from] < amount) throw Error("잔액 부족");
  if (amount === 0n || from === to) return;
  w.accounts[from] -= amount;
  w.accounts[to] += amount;
  w.journal.push({
    id: `j${w.turn}-${w.journal.length}`,
    turn: w.turn,
    causeEventId,
    postings: [
      { accountId: to, debitMinor: amount, creditMinor: 0n },
      { accountId: from, debitMinor: 0n, creditMinor: amount },
    ],
  });
}
export function assertInvariants(w: World): void {
  const ids = new Set(w.citizens.map((c) => c.id));
  if (ids.size !== w.citizens.length) throw Error("시민 ID 중복");
  if (w.citizens.filter((c) => c.alive).length !== w.metrics.population)
    throw Error("인구 집계 불일치");
  if (w.parties.reduce((n, p) => n + p.seats, 0) !== 11)
    throw Error("의석 수 불일치");
  if (Object.values(w.accounts).some((n) => n < 0n)) throw Error("음수 잔액");
  if (Object.values(w.accounts).reduce((a, b) => a + b, 0n) !== w.moneySupply)
    throw Error("통화 보존 위반");
  if (
    w.accounts.bank + w.loans.reduce((n, l) => n + l.principal, 0n) !==
    w.bankCapital + w.bankDeposits
  )
    throw Error("은행 대차 불일치");
  for (const j of w.journal)
    if (
      j.postings.reduce((n, p) => n + p.debitMinor - p.creditMinor, 0n) !== 0n
    )
      throw Error("분개 불균형");
  for (const c of w.companies) {
    const expected =
      (w.inventoryOpening[c.id] ?? 0) +
      w.inventoryLedger
        .filter((e) => e.companyId === c.id)
        .reduce((n, e) => n + e.quantity, 0);
    if (expected !== c.inventory) throw Error("물량 보존 위반");
  }
  for (const c of w.companies)
    if (c.inventory < 0 || !Number.isSafeInteger(c.inventory))
      throw Error("재고 오류");
  for (const h of w.households)
    for (const id of h.memberIds)
      if (!ids.has(id)) throw Error("고아 가구 구성원");
  const employed = w.companies.flatMap((c) => c.employees);
  if (new Set(employed).size !== employed.length) throw Error("중복 고용");
  for (const c of w.citizens)
    if (
      c.alive &&
      !w.households.some(
        (h) => h.id === c.householdId && h.memberIds.includes(c.id),
      )
    )
      throw Error("가구 참조 오류");
  if (w.status === "ended" && !w.endReason) throw Error("종료 사유 누락");
}

export function inventory(
  w: World,
  companyId: string,
  quantity: number,
  causeEventId: string,
) {
  const company = w.companies.find((c) => c.id === companyId);
  if (
    !company ||
    !Number.isSafeInteger(quantity) ||
    company.inventory + quantity < 0
  )
    throw Error("물량 거래 오류");
  company.inventory += quantity;
  w.inventoryLedger.push({ companyId, quantity, causeEventId });
}
