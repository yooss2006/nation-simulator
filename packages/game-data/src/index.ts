import type { Difficulty } from "../../contracts/src/index";
export const RULES = {
  initialPopulation: 1000,
  seats: 11,
  presidentialTerm: 48,
  firstParliament: 24,
  parliamentTerm: 48,
  wage: 1500n,
  foodPrice: 800n,
  foodPerPerson: 2,
  projectCost: 300000n,
  projectMonths: 6,
  maxTax: 50,
};
// Difficulty affects endowments only; all turn rules are shared.
export const ENDOWMENTS: Record<
  Difficulty,
  { cash: bigint; capacity: number; infrastructure: number }
> = {
  easy: { cash: 20000000n, capacity: 90, infrastructure: 1.2 },
  normal: { cash: 12000000n, capacity: 75, infrastructure: 1 },
  hard: { cash: 7000000n, capacity: 60, infrastructure: 0.8 },
  extreme: { cash: 3500000n, capacity: 45, infrastructure: 0.6 },
};
export const PARTY_NAMES = [
  "시민연합",
  "자유미래당",
  "사회연대당",
  "녹색공동체",
];
