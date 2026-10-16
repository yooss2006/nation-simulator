import { describe, it, expect } from "vitest";
import { generateWorld } from "../packages/world-generator/src/index";
import {
  advanceMonth,
  serialize,
  deserialize,
  stateHash,
  assertInvariants,
  allocateSeats,
  transfer,
  elections,
} from "../packages/simulation-core/src/index";
import type { Command } from "../packages/contracts/src/index";
const cmd = (
  kind: Command["kind"],
  payload: Command["payload"],
  id = "cmd",
): Command => ({
  id,
  turn: 0,
  expectedRevision: 0,
  actorId: "president",
  kind,
  payload,
});
describe("세계 및 경제 불변식", () => {
  it("동일 시드, 1,000명, 난이도에 따른 초기 조건", () => {
    const a = generateWorld(),
      b = generateWorld();
    expect(stateHash(a)).toBe(stateHash(b));
    expect(a.citizens.length).toBe(1000);
    expect(generateWorld(2026, "easy").accounts.treasury).toBeGreaterThan(
      generateWorld(2026, "extreme").accounts.treasury,
    );
    assertInvariants(a);
  });
  it("12개월 임금→소비→세수 및 저장 복원 재현", () => {
    let a = generateWorld();
    let b = deserialize(serialize(a));
    for (let i = 0; i < 12; i++) {
      a = advanceMonth(a);
      b = advanceMonth(b);
      expect(stateHash(a)).toBe(stateHash(b));
      assertInvariants(a);
      const prev = i === 0 ? 1000 : a.history[i - 1].population;
      expect(a.metrics.population).toBe(
        prev +
          a.metrics.births -
          a.metrics.deaths +
          a.metrics.immigrants -
          a.metrics.emigrants,
      );
    }
    expect(a.metrics.gdp).toBeGreaterThan(0n);
    expect(a.metrics.tax).toBeGreaterThan(0n);
    expect(a.turn).toBe(12);
  });
  it("잘못된 명령은 원본 상태를 변경하지 않는다", () => {
    const w = generateWorld(),
      before = serialize(w);
    expect(() => advanceMonth(w, [cmd("tax", { value: 90 })])).toThrow();
    expect(serialize(w)).toBe(before);
    expect(() =>
      advanceMonth(w, [{ ...cmd("tax", { value: 20 }), expectedRevision: 3 }]),
    ).toThrow();
  });
  it("중복 명령 거부 및 월 경계 법률 시행", () => {
    const w = generateWorld();
    const c = cmd("tax", { value: 20 });
    expect(() => advanceMonth(w, [c, c])).toThrow("중복");
    const a = advanceMonth(w, [c]);
    expect(a.laws[0].status).toBe("passed");
    expect(a.incomeTax).toBe(20);
  });
  it("음수·초과 거래 거부", () => {
    const w = generateWorld();
    expect(() => transfer(w, "treasury", "bank", -1n, "test")).toThrow();
    expect(() => transfer(w, "treasury", "bank", 999999999n, "test")).toThrow();
    assertInvariants(w);
  });
  it("국채 발행과 상환은 은행 대차와 통화량을 보존", () => {
    let w = advanceMonth(generateWorld(), [cmd("bond", { value: 300000 })]);
    for (let i = 0; i < 24; i++) w = advanceMonth(w);
    assertInvariants(w);
    expect(w.governmentDebt).toBe(0n);
  });
  it("공공사업: 선지급, 6개월 후 필지에 준공 반영", () => {
    const initial = generateWorld();
    const p = initial.parcels.find(
      (p) => p.terrain === "plain" && !p.building,
    )!;
    let w = advanceMonth(initial, [
      cmd("project", { target: p.id, project: "road" }),
    ]);
    for (let i = 1; i < 6; i++) w = advanceMonth(w);
    expect(w.projects[0].complete).toBe(true);
    expect(w.parcels.find((x) => x.id === p.id)?.building).toBe("road");
  });
  it("손상·버전 불일치·유효하지 않은 금액 거부", () => {
    const w = generateWorld();
    expect(() => deserialize("{")).toThrow();
    expect(() =>
      deserialize(
        serialize(w).replace('"schemaVersion":1', '"schemaVersion":2'),
      ),
    ).toThrow();
    w.accounts.treasury = -1n;
    expect(() => deserialize(serialize(w))).toThrow();
  });
});
describe("정치 일정", () => {
  it("생트라고식 의석 총합 및 동률 결정 순서", () => {
    expect(allocateSeats([100, 80, 30, 10])).toEqual([5, 4, 2, 0]);
    expect(allocateSeats([1, 1], 3)).toEqual([2, 1]);
    expect(() => allocateSeats([0, 0])).toThrow();
  });
  it("총선 24개월, 대통령 48개월과 낙선 종료", () => {
    let w = generateWorld();
    for (let i = 0; i < 24; i++) w = advanceMonth(w);
    expect(w.events.some((e) => e.type === "parliament")).toBe(true);
    expect(w.parties.reduce((n, p) => n + p.seats, 0)).toBe(11);
    w.turn = 48;
    w.citizens.forEach((c) => {
      c.preference = [...w.parties[1].ideology];
    });
    w.households.forEach((h) => (h.satisfaction = 0));
    elections(w);
    expect(w.status).toBe("ended");
    expect(() => advanceMonth(w)).toThrow("종료");
  });
  it("대선 재선에는 임기 수 증가", () => {
    const w = generateWorld();
    w.turn = 48;
    w.citizens.forEach((c) => {
      c.preference = [0, 0, 0];
    });
    w.households.forEach((h) => (h.satisfaction = 100));
    elections(w);
    expect(w.status).toBe("running");
    expect(w.presidentTerms).toBe(2);
  });
});
