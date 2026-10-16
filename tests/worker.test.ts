import { describe, it, expect, vi } from "vitest";
import { gzipSync } from "node:zlib";
import worker, {
  handleApi,
  boundedBody,
  cleanup,
  authenticate,
} from "../apps/worker/src/index";
import type { Env, Repository, Metadata } from "../apps/worker/src/types";
import { compressSnapshot, expandSnapshot } from "../apps/web/src/cloud-codec";
import { generateWorld } from "../packages/world-generator/src/index";
import { serialize, stateHash } from "../packages/simulation-core/src/index";
const user = "11111111-1111-4111-8111-111111111111";
const slot = "22222222-2222-4222-8222-222222222222";
class MemoryRepo implements Repository {
  data = new Map<string, Metadata>();
  writes = 0;
  reads = 0;
  async list(owner: string) {
    return [...this.data.values()]
      .filter((s) => s.owner_id === owner)
      .map((s) => ({ id: s.id, revision: s.revision }));
  }
  async get(id: string, owner: string) {
    const s = this.data.get(id);
    return s?.owner_id === owner ? s : undefined;
  }
  async consume(_owner: string, write: boolean) {
    return write ? ++this.writes <= 30 : ++this.reads <= 300;
  }
  async commit(
    owner: string,
    id: string,
    expected: number,
    key: string,
    checksum: string,
    bytes: number,
  ) {
    const old = await this.get(id, owner);
    if (expected === 0 && this.data.size >= 3)
      return { ok: false, reason: "quota" as const };
    if ((old?.revision ?? 0) !== expected)
      return { ok: false, reason: "conflict" as const };
    this.data.set(id, {
      id,
      owner_id: owner,
      revision: expected + 1,
      snapshot_key: key,
      previous_key: old?.snapshot_key ?? null,
      checksum,
      byte_size: bytes,
    });
    return { ok: true, oldKey: old?.previous_key ?? undefined };
  }
  async referenced(keys: string[]) {
    return [...this.data.values()]
      .flatMap((s) => [s.snapshot_key, s.previous_key])
      .filter((s): s is string => !!s && keys.includes(s));
  }
  async close() {}
}
function fixture() {
  const objects = new Map<string, { bytes: Uint8Array; uploaded: Date }>();
  const bucket = {
    put: vi.fn(async (key: string, bytes: Uint8Array) => {
      objects.set(key, { bytes, uploaded: new Date() });
    }),
    get: vi.fn(async (key: string) => {
      const o = objects.get(key);
      return o ? { body: new Blob([new Uint8Array(o.bytes)]).stream() } : null;
    }),
    delete: vi.fn(async (keys: string | string[]) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) objects.delete(k);
    }),
    list: vi.fn(async () => ({
      truncated: false,
      objects: [...objects].map(([key, o]) => ({ key, uploaded: o.uploaded })),
    })),
  };
  const env = {
    SAVES: bucket,
    ASSETS: { fetch: async () => new Response("web") },
  } as unknown as Env;
  return { env, repo: new MemoryRepo(), objects, bucket };
}
const req = (
  method: string,
  id = "",
  revision = 0,
  bytes: Uint8Array = gzipSync("test"),
) =>
  new Request(`https://game.example/api/saves${id ? "/" + id : ""}`, {
    method,
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Save-Revision": String(revision),
    },
    body: method === "GET" ? undefined : new Uint8Array(bytes),
  });
describe("Workers 무료 저장 API", () => {
  it("인프라 미연결 시 API만 닫히고 웹은 동작", async () => {
    const { env } = fixture();
    expect(
      (await worker.fetch(new Request("https://game.example/api/saves"), env))
        .status,
    ).toBe(503);
    expect(
      await (
        await worker.fetch(new Request("https://game.example/"), env)
      ).text(),
    ).toBe("web");
  });
  it("무인증과 허용 목록 밖 계정을 거부", async () => {
    const { env } = fixture();
    env.ALLOWED_USER_IDS = user;
    env.SUPABASE_URL = "https://example.supabase.co";
    env.SUPABASE_ANON_KEY = "public-test";
    await expect(
      authenticate(new Request("https://game.example"), env),
    ).rejects.toMatchObject({ status: 401 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ id: slot }))),
    );
    try {
      await expect(
        authenticate(
          new Request("https://game.example", {
            headers: { Authorization: "Bearer test" },
          }),
          env,
        ),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("크기 헤더 없이 전송해도 최대 크기 검사", async () => {
    await expect(
      boundedBody(req("POST", "", 0, new Uint8Array(40)), 20),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("쓰기/읽기, 소유권, 동시 갱신과 이전 1개 보관", async () => {
    const { env, repo, objects } = fixture();
    const first = await handleApi(req("POST"), env, repo, user);
    const { id } = await first.json();
    expect(first.status).toBe(201);
    expect((await handleApi(req("GET", id), env, repo, slot)).status).toBe(404);
    const updates = await Promise.all([
      handleApi(req("PUT", id, 1), env, repo, user),
      handleApi(req("PUT", id, 1), env, repo, user),
    ]);
    expect(updates.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(objects.size).toBe(2);
    expect((await handleApi(req("PUT", id, 2), env, repo, user)).status).toBe(
      200,
    );
    expect(objects.size).toBe(2);
    expect(
      (await handleApi(req("GET", id), env, repo, user)).headers.get(
        "X-Save-Revision",
      ),
    ).toBe("3");
  });
  it("슬롯과 일일 저장 제한은 서버에서 적용", async () => {
    const { env, repo, objects } = fixture();
    for (let i = 0; i < 3; i++)
      expect((await handleApi(req("POST"), env, repo, user)).status).toBe(201);
    expect((await handleApi(req("POST"), env, repo, user)).status).toBe(409);
    expect(objects.size).toBe(3);
    repo.writes = 30;
    expect((await handleApi(req("POST"), env, repo, user)).status).toBe(429);
  });
  it("압축 형식이 아닌 데이터 거부", async () => {
    const { env, repo } = fixture();
    expect(
      (await handleApi(req("POST", "", 0, new Uint8Array(20)), env, repo, user))
        .status,
    ).toBe(400);
  });
  it("48시간이 지난 고아 객체만 삭제", async () => {
    const { env, repo, objects } = fixture();
    await handleApi(req("POST"), env, repo, user);
    objects.set("snapshots/orphan", {
      bytes: new Uint8Array(),
      uploaded: new Date(0),
    });
    for (const [k, o] of objects)
      if (k !== "snapshots/orphan") o.uploaded = new Date(0);
    await cleanup(env, repo);
    expect(objects.size).toBe(1);
    expect(objects.has("snapshots/orphan")).toBe(false);
  });
});
describe("브라우저 gzip 전송", () => {
  it("실제 세계의 압축/복원과 해시 동일", async () => {
    const snapshot = serialize(generateWorld());
    const bytes = await compressSnapshot(snapshot);
    const checksum = Buffer.from(
      await crypto.subtle.digest("SHA-256", bytes),
    ).toString("hex");
    const restored = await expandSnapshot(
      new Response(bytes, { headers: { "X-Save-Checksum": checksum } }),
    );
    expect(stateHash(restored)).toBe(stateHash(snapshot));
    expect(bytes.byteLength).toBeLessThan(1048576);
  });
  it("손상된 체크섬과 압축 폭탄 거부", async () => {
    await expect(
      expandSnapshot(
        new Response(new Uint8Array(gzipSync("x")), {
          headers: { "X-Save-Checksum": "wrong" },
        }),
      ),
    ).rejects.toThrow("체크섬");
    const data = new Uint8Array(gzipSync("x".repeat(9_000_000)));
    const checksum = Buffer.from(
      await crypto.subtle.digest("SHA-256", data),
    ).toString("hex");
    await expect(
      expandSnapshot(
        new Response(data, { headers: { "X-Save-Checksum": checksum } }),
      ),
    ).rejects.toThrow("압축 해제 크기");
  });
});
