import { z } from "zod";
import type { World } from "../../contracts/src/index";
import { assertInvariants } from "./accounting";
export function serialize(w: World): string {
  return JSON.stringify(w, (_, v) => {
    if (typeof v === "bigint") return { $money: v.toString() };
    if (v && typeof v === "object" && !Array.isArray(v))
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, v[k]]),
      );
    return v;
  });
}
export function stateHash(value: World | string): string {
  const s = typeof value === "string" ? value : serialize(value);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}
const money = z.bigint().nonnegative();
const num = z.number().finite();
const id = z.string().min(1);
const ideology = z.tuple([
  num.min(-1).max(1),
  num.min(-1).max(1),
  num.min(-1).max(1),
]);
const metrics = z.object({
  turn: num.int().nonnegative(),
  population: num.int().nonnegative(),
  employed: num.int().nonnegative(),
  laborForce: num.int().nonnegative(),
  unemployment: num,
  priceIndex: num,
  approval: num,
  births: num.int(),
  deaths: num.int(),
  immigrants: num.int(),
  emigrants: num.int(),
  gdp: money,
  consumption: money,
  tax: money,
});
// Validate every field consumed by the engine; never treat JSON.parse as a type check.
const schema = z.object({
  schemaVersion: z.literal(1),
  engineVersion: z.literal("0.1.0"),
  ruleVersion: z.literal("0.1.0"),
  seed: num.int(),
  turn: num.int().nonnegative(),
  revision: num.int().nonnegative(),
  difficulty: z.enum(["easy", "normal", "hard", "extreme"]),
  ideology,
  status: z.enum(["running", "ended"]),
  endReason: z.string().nullable(),
  rng: z.record(z.string(), num.int()),
  accounts: z.record(id, money),
  incomeTax: num.int().min(0).max(50),
  policyRateBps: num.int().nonnegative(),
  governmentDebt: money,
  bankCapital: money,
  bankDeposits: money,
  moneySupply: money,
  infrastructure: num.positive(),
  presidentTerms: num.int().positive(),
  citizens: z.array(
    z.object({
      id,
      householdId: id,
      ageMonths: num.int().nonnegative(),
      education: num,
      health: num,
      preference: ideology,
      employerId: id.nullable(),
      alive: z.boolean(),
    }),
  ),
  households: z.array(
    z.object({
      id,
      memberIds: z.array(id),
      accountId: id,
      food: num.int().nonnegative(),
      satisfaction: num.min(0).max(100),
    }),
  ),
  companies: z.array(
    z.object({
      id,
      name: z.string(),
      sector: z.enum(["food", "materials", "services"]),
      accountId: id,
      employees: z.array(id),
      inventory: num.int().nonnegative(),
      price: money.refine((x) => x > 0n),
      wage: money.refine((x) => x > 0n),
      capacity: num.int().positive(),
      active: z.boolean(),
    }),
  ),
  parcels: z.array(
    z.object({
      id,
      x: num.int(),
      y: num.int(),
      terrain: z.enum(["water", "forest", "plain", "hill"]),
      resource: num,
      building: z
        .enum(["housing", "farm", "factory", "civic", "road"])
        .nullable(),
    }),
  ),
  parties: z
    .array(
      z.object({
        id,
        name: z.string(),
        ideology,
        seats: num.int().nonnegative(),
        votes: num.int().nonnegative(),
      }),
    )
    .min(1),
  laws: z.array(
    z.object({
      id,
      tax: num.int().min(0).max(50),
      status: z.enum(["proposed", "passed", "rejected"]),
      effectiveTurn: num.int(),
      yes: num.int(),
      no: num.int(),
    }),
  ),
  projects: z.array(
    z.object({
      id,
      parcelId: id,
      kind: z.enum(["road", "hospital", "school"]),
      remaining: num.int().nonnegative(),
      cost: money,
      complete: z.boolean(),
    }),
  ),
  neighbors: z.array(
    z.object({
      id,
      name: z.string(),
      population: num.int(),
      relation: num,
      foodPrice: money,
      exchangeRate: num.positive(),
      tradeAgreement: z.boolean(),
    }),
  ),
  loans: z.array(
    z.object({
      id,
      borrower: id,
      principal: money,
      remaining: num.int(),
      rateBps: num.int(),
    }),
  ),
  inventoryOpening: z.record(id, num.int().nonnegative()),
  inventoryLedger: z.array(
    z.object({ companyId: id, quantity: num.int(), causeEventId: id }),
  ),
  journal: z.array(
    z.object({
      id,
      turn: num.int(),
      causeEventId: id,
      postings: z.array(
        z.object({ accountId: id, debitMinor: money, creditMinor: money }),
      ),
    }),
  ),
  events: z.array(
    z.object({
      id,
      turn: num.int(),
      type: id,
      subjectIds: z.array(id),
      causeIds: z.array(id),
      message: z.string(),
    }),
  ),
  commands: z.array(
    z.object({
      id,
      turn: num.int(),
      actorId: z.literal("president"),
      expectedRevision: num.int(),
      kind: z.enum(["tax", "project", "diplomacy", "bond"]),
      payload: z.object({
        value: num.optional(),
        target: z.string().optional(),
        project: z.enum(["road", "hospital", "school"]).optional(),
      }),
    }),
  ),
  metrics,
  history: z.array(metrics),
});
export function deserialize(text: string): World {
  if (text.length > 20_000_000) throw Error("저장 파일이 너무 큽니다");
  const parsed = JSON.parse(text, (_, v) =>
    v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.keys(v).length === 1 &&
    typeof v.$money === "string" &&
    /^\d{1,40}$/.test(v.$money)
      ? BigInt(v.$money)
      : v,
  );
  const w = schema.parse(parsed);
  assertInvariants(w);
  return w;
}
