export type Difficulty = "easy" | "normal" | "hard" | "extreme";
export type Ideology = [number, number, number];
export type Money = bigint;
export interface Citizen {
  id: string;
  householdId: string;
  ageMonths: number;
  education: number;
  health: number;
  preference: Ideology;
  employerId: string | null;
  alive: boolean;
}
export interface Household {
  id: string;
  memberIds: string[];
  accountId: string;
  food: number;
  satisfaction: number;
}
export interface Company {
  id: string;
  name: string;
  sector: "food" | "materials" | "services";
  accountId: string;
  employees: string[];
  inventory: number;
  price: Money;
  wage: Money;
  capacity: number;
  active: boolean;
}
export interface Parcel {
  id: string;
  x: number;
  y: number;
  terrain: "water" | "forest" | "plain" | "hill";
  resource: number;
  building: "housing" | "farm" | "factory" | "civic" | "road" | null;
}
export interface Posting {
  accountId: string;
  debitMinor: Money;
  creditMinor: Money;
}
export interface Journal {
  id: string;
  turn: number;
  causeEventId: string;
  postings: Posting[];
}
export interface DomainEvent {
  id: string;
  turn: number;
  type: string;
  subjectIds: string[];
  causeIds: string[];
  message: string;
}
export interface Party {
  id: string;
  name: string;
  ideology: Ideology;
  seats: number;
  votes: number;
}
export interface Law {
  id: string;
  tax: number;
  status: "proposed" | "passed" | "rejected";
  effectiveTurn: number;
  yes: number;
  no: number;
}
export interface Project {
  id: string;
  parcelId: string;
  kind: "road" | "hospital" | "school";
  remaining: number;
  cost: Money;
  complete: boolean;
}
export interface Neighbor {
  id: string;
  name: string;
  population: number;
  relation: number;
  foodPrice: Money;
  exchangeRate: number;
  tradeAgreement: boolean;
}
export interface Loan {
  id: string;
  borrower: string;
  principal: Money;
  remaining: number;
  rateBps: number;
}
export interface Metrics {
  turn: number;
  population: number;
  employed: number;
  laborForce: number;
  unemployment: number;
  gdp: Money;
  consumption: Money;
  tax: Money;
  priceIndex: number;
  approval: number;
  births: number;
  deaths: number;
  immigrants: number;
  emigrants: number;
}
export interface Command {
  id: string;
  turn: number;
  actorId: "president";
  expectedRevision: number;
  kind: "tax" | "project" | "diplomacy" | "bond";
  payload: {
    value?: number;
    target?: string;
    project?: "road" | "hospital" | "school";
  };
}
export interface World {
  schemaVersion: 1;
  engineVersion: "0.1.0";
  ruleVersion: "0.1.0";
  seed: number;
  turn: number;
  revision: number;
  difficulty: Difficulty;
  ideology: Ideology;
  status: "running" | "ended";
  endReason: string | null;
  rng: Record<string, number>;
  citizens: Citizen[];
  households: Household[];
  companies: Company[];
  parcels: Parcel[];
  accounts: Record<string, Money>;
  parties: Party[];
  laws: Law[];
  projects: Project[];
  neighbors: Neighbor[];
  loans: Loan[];
  incomeTax: number;
  policyRateBps: number;
  governmentDebt: Money;
  bankCapital: Money;
  bankDeposits: Money;
  moneySupply: Money;
  infrastructure: number;
  inventoryOpening: Record<string, number>;
  inventoryLedger: {
    companyId: string;
    quantity: number;
    causeEventId: string;
  }[];
  journal: Journal[];
  events: DomainEvent[];
  commands: Command[];
  history: Metrics[];
  metrics: Metrics;
  presidentTerms: number;
}
export type WorkerRequest =
  | {
      requestId: number;
      type: "new";
      seed: number;
      difficulty: Difficulty;
      ideology: Ideology;
    }
  | { requestId: number; type: "turn"; commands: Command[] }
  | { requestId: number; type: "load"; snapshot: string };
export type WorkerResponse =
  | { requestId: number; ok: true; snapshot: string; hash: string }
  | { requestId: number; ok: false; error: string };
