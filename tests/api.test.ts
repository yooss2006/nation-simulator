import { it, expect } from "vitest";
import { buildServer, type Store, type Save } from "../apps/api/src/server";
import { generateWorld } from "../packages/world-generator/src/index";
import { serialize } from "../packages/simulation-core/src/index";
class MemoryStore implements Store {
  data = new Map<string, Save>();
  async list(owner: string) {
    return [...this.data.values()]
      .filter((s) => s.owner === owner)
      .map((s) => ({ id: s.id, revision: s.revision }));
  }
  async get(id: string, owner: string) {
    const s = this.data.get(id);
    return s?.owner === owner ? s : undefined;
  }
  async create(save: Save) {
    this.data.set(save.id, save);
  }
  async update(save: Save, expected: number) {
    const current = this.data.get(save.id);
    if (
      !current ||
      current.owner !== save.owner ||
      current.revision !== expected
    )
      return false;
    this.data.set(save.id, save);
    return true;
  }
}
it("저장 API 인증, 소유권, CAS 충돌 및 손상 파일 검증", async () => {
  const app = buildServer(new MemoryStore(), async (t) =>
    t === "user1" || t === "user2" ? t : null,
  );
  const headers = { authorization: "Bearer user1" };
  const snapshot = serialize(generateWorld());
  try {
    expect(
      (await app.inject({ method: "GET", url: "/saves" })).statusCode,
    ).toBe(401);
    const created = await app.inject({
      method: "POST",
      url: "/saves",
      headers,
      payload: { snapshot },
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/saves/${id}`,
          headers: { authorization: "Bearer user2" },
        })
      ).statusCode,
    ).toBe(404);
    const updates = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: "PUT",
          url: `/saves/${id}`,
          headers,
          payload: { snapshot, expectedRevision: 1 },
        }),
      ),
    );
    expect(updates.map((x) => x.statusCode).sort()).toEqual([200, 409]);
    expect(
      updates.find((x) => x.statusCode === 409)!.json().current.snapshot,
    ).toBe(snapshot);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/saves",
          headers,
          payload: { snapshot: "{}" },
        })
      ).statusCode,
    ).toBe(400);
  } finally {
    await app.close();
  }
});
