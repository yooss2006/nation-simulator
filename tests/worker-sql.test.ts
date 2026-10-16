import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
it("실제 PostgreSQL 엔진에서 슬롯·횟수 제한과 리비전 CAS 검증", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    await db.exec(await readFile("apps/worker/schema.sql", "utf8"));
    const user = "11111111-1111-4111-8111-111111111111";
    const checksum = "a".repeat(64);
    for (let i = 0; i < 30; i++) {
      const q = await db.query<{ allowed: boolean }>(
        "SELECT consume_cloud_quota($1,true) AS allowed",
        [user],
      );
      expect(q.rows[0].allowed).toBe(true);
    }
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "SELECT consume_cloud_quota($1,true) AS allowed",
          [user],
        )
      ).rows[0].allowed,
    ).toBe(false);
    const commit = async (id: string, rev: number, key: string) =>
      (
        await db.query<{
          result: { ok: boolean; reason?: string; oldKey?: string };
        }>("SELECT commit_cloud_save($1,$2,$3,$4,$5,$6) AS result", [
          user,
          id,
          rev,
          key,
          checksum,
          500,
        ])
      ).rows[0].result;
    const ids = [1, 2, 3, 4].map(
      (i) => `22222222-2222-4222-8222-${String(i).padStart(12, "0")}`,
    );
    for (let i = 0; i < 3; i++)
      expect((await commit(ids[i], 0, "key" + i)).ok).toBe(true);
    expect((await commit(ids[3], 0, "key4")).reason).toBe("quota");
    expect((await commit(ids[0], 1, "newkey")).ok).toBe(true);
    expect((await commit(ids[0], 1, "stale")).reason).toBe("conflict");
    expect((await commit(ids[0], 2, "newest")).oldKey).toBe("key0");
    expect(
      (
        await db.query<{ revision: number }>(
          "SELECT revision FROM cloud_saves WHERE id=$1",
          [ids[0]],
        )
      ).rows[0].revision,
    ).toBe(3);
    const access = await db.query<{ allowed: boolean }>(
      "SELECT has_table_privilege('anon','cloud_saves','SELECT') AS allowed",
    );
    expect(access.rows[0].allowed).toBe(false);
  } finally {
    await db.close();
  }
});
