import type { World } from "../../contracts/src/index";
import { event } from "./accounting";
export function allocateSeats(votes: number[], seats = 11): number[] {
  if (
    !votes.length ||
    votes.some((v) => !Number.isFinite(v) || v < 0) ||
    !votes.some((v) => v > 0) ||
    !Number.isInteger(seats) ||
    seats < 0
  )
    throw Error("잘못된 득표 데이터");
  const result = votes.map(() => 0);
  for (let i = 0; i < seats; i++) {
    let best = 0;
    for (let j = 1; j < votes.length; j++)
      if (votes[j] / (2 * result[j] + 1) > votes[best] / (2 * result[best] + 1))
        best = j;
    result[best]++;
  }
  return result;
}
export function elections(w: World): void {
  const voters = w.citizens.filter((c) => c.alive && c.ageMonths >= 216);
  const homes = new Map(w.households.map((h) => [h.id, h]));
  const scores = (c: (typeof voters)[number]) =>
    w.parties.map((p, i) => {
      const distance = p.ideology.reduce(
        (n, v, j) => n + Math.abs(v - c.preference[j]),
        0,
      );
      return (
        4 -
        distance +
        (i === 0
          ? ((homes.get(c.householdId)?.satisfaction ?? 50) - 50) / 20
          : 0)
      );
    });
  const votes = w.parties.map(() => 0);
  for (const c of voters) {
    const s = scores(c);
    votes[s.indexOf(Math.max(...s))]++;
  }
  if (w.turn >= 24 && (w.turn - 24) % 48 === 0) {
    const seats = allocateSeats(votes);
    w.parties.forEach((p, i) => {
      p.seats = seats[i];
      p.votes = votes[i];
    });
    event(
      w,
      "parliament",
      `총선: ${w.parties.map((p) => `${p.name} ${p.seats}석`).join(", ")}`,
    );
  }
  if (w.turn > 0 && w.turn % 48 === 0) {
    const ranked = votes
      .map((v, i) => ({ v, i }))
      .sort((a, b) => b.v - a.v || a.i - b.i);
    let winner = ranked[0].i;
    if (ranked[0].v <= voters.length / 2) {
      const [a, b] = ranked;
      let av = 0,
        bv = 0;
      for (const c of voters) {
        const s = scores(c);
        if (s[a.i] >= s[b.i]) av++;
        else bv++;
      }
      winner = av >= bv ? a.i : b.i;
      event(
        w,
        "runoff",
        `대통령 결선투표: ${w.parties[a.i].name} ${av}표, ${w.parties[b.i].name} ${bv}표`,
      );
    }
    if (winner !== 0) {
      w.status = "ended";
      w.endReason = "대통령 선거 낙선";
      event(w, "ending", "선거 결과 대통령직을 상실했습니다");
    } else {
      w.presidentTerms++;
      event(w, "election", "대통령 연임이 확정되었습니다");
    }
  }
}
