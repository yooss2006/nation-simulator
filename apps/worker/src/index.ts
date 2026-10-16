import type {
  ExecutionContext,
  ScheduledController,
} from "@cloudflare/workers-types";
import { connect } from "./repository";
import {
  HttpError,
  LIMITS,
  type Env,
  type Repository,
  type Metadata,
} from "./types";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function boundedBody(
  req: Request,
  max = LIMITS.compressedBytes,
): Promise<Uint8Array> {
  const size = Number(req.headers.get("Content-Length"));
  if (size > max)
    throw new HttpError(413, "압축 세이브는 1 MiB 이하여야 합니다");
  if (!req.body) throw new HttpError(400, "저장 데이터가 없습니다");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new HttpError(413, "압축 세이브 크기 초과");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const part of chunks) {
    body.set(part, offset);
    offset += part.length;
  }
  return body;
}
export async function authenticate(
  request: Request,
  env: Env,
): Promise<string> {
  const token = request.headers.get("Authorization");
  if (!token?.startsWith("Bearer "))
    throw new HttpError(401, "로그인이 필요합니다");
  const users = (env.ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    !users.length ||
    users.length > LIMITS.testers ||
    users.some((id) => !UUID.test(id))
  )
    throw new HttpError(503, "테스트 계정 허용 목록 설정이 필요합니다");
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: token, apikey: env.SUPABASE_ANON_KEY! },
  });
  if (!res.ok) throw new HttpError(401, "로그인이 만료됐습니다");
  const user = (await res.json()) as { id?: string };
  if (!user.id || !users.includes(user.id))
    throw new HttpError(
      403,
      "허용된 테스트 계정만 온라인 저장을 사용할 수 있습니다",
    );
  return user.id;
}
export async function handleApi(
  request: Request,
  env: Env,
  repo: Repository,
  owner: string,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const match = path.match(/^\/api\/saves(?:\/([0-9a-f-]+))?$/i);
  if (!match) return json({ error: "경로 없음" }, 404);
  const id = match[1];
  if (id && !UUID.test(id)) return json({ error: "잘못된 저장 ID" }, 400);
  const write = request.method === "POST" || request.method === "PUT";
  if (
    !["GET", "POST", "PUT"].includes(request.method) ||
    (request.method === "POST" && id) ||
    (request.method === "PUT" && !id)
  )
    return json({ error: "지원하지 않는 요청" }, 405);
  if (!(await repo.consume(owner, write)))
    return json(
      {
        error: write
          ? "하루 저장 30회 한도입니다. 로컬 저장은 계속 사용할 수 있습니다"
          : "하루 온라인 조회 300회 한도입니다",
      },
      429,
    );
  if (request.method === "GET") {
    if (!id) return json(await repo.list(owner));
    // A previous version is retained, so a reader racing one update still succeeds.
    const current = await repo.get(id, owner);
    if (!current) return json({ error: "저장을 찾을 수 없습니다" }, 404);
    const object = await env.SAVES.get(current.snapshot_key);
    if (!object)
      return json(
        { error: "저장 파일을 찾을 수 없습니다. 잠시 후 다시 복원하세요" },
        503,
      );
    return new Response(object.body as unknown as ReadableStream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Save-Revision": String(current.revision),
        "X-Save-Checksum": current.checksum,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (request.headers.get("Content-Type") !== "application/octet-stream")
    return json({ error: "압축 바이너리 데이터가 필요합니다" }, 415);
  const expected =
    request.method === "POST"
      ? 0
      : Number(request.headers.get("X-Save-Revision"));
  if (
    !Number.isSafeInteger(expected) ||
    expected < 0 ||
    (request.method === "PUT" && expected === 0)
  )
    return json({ error: "저장 리비전이 필요합니다" }, 400);
  if (id) {
    const current = await repo.get(id, owner);
    if (!current) return json({ error: "저장을 찾을 수 없습니다" }, 404);
    if (current.revision !== expected)
      return json(
        { error: "저장 충돌", current: { id, revision: current.revision } },
        409,
      );
  }
  const bytes = await boundedBody(request);
  if (
    bytes.length < 18 ||
    bytes[0] !== 31 ||
    bytes[1] !== 139 ||
    bytes[2] !== 8
  )
    return json({ error: "gzip 저장 형식이 아닙니다" }, 400);
  // Expanded size is validated again by a bounded decompressor in the browser.
  const checksum = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as BufferSource),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const saveId = id ?? crypto.randomUUID();
  const key = `snapshots/${owner}/${saveId}/${crypto.randomUUID()}.gz`;
  await env.SAVES.put(key, bytes, {
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: { checksum },
  });
  let result;
  try {
    result = await repo.commit(
      owner,
      saveId,
      expected,
      key,
      checksum,
      bytes.length,
    );
  } catch (e) {
    // Commit outcome can be unknown after a connection loss. Never delete blindly:
    // orphan cleanup verifies DB references after a 48h grace period.
    throw e;
  }
  if (!result.ok) {
    await env.SAVES.delete(key);
    if (result.reason === "quota")
      return json(
        { error: "계정당 3슬롯 또는 전체 테스트 저장 한도에 도달했습니다" },
        409,
      );
    const current = await repo.get(saveId, owner);
    return json(
      {
        error: "저장 충돌",
        current: current ? { id: saveId, revision: current.revision } : null,
      },
      409,
    );
  }
  if (result.oldKey) {
    try {
      await env.SAVES.delete(result.oldKey);
    } catch {
      /* Daily cleanup retries; the committed save remains valid. */
    }
  }
  return json(
    { id: saveId, revision: expected + 1, checksum },
    request.method === "POST" ? 201 : 200,
  );
}
export async function cleanup(env: Env, repo: Repository) {
  const batch = await env.SAVES.list({ prefix: "snapshots/", limit: 1000 });
  // Refuse partial scans: normal private-test quotas keep orphan volume <1,000.
  if (batch.truncated)
    throw Error("Cleanup backlog exceeds one batch; operator action required");
  const old = batch.objects
    .filter((o) => o.uploaded.getTime() < Date.now() - 48 * 60 * 60 * 1000)
    .map((o) => o.key);
  const keep = new Set(await repo.referenced(old));
  const unused = old.filter((k) => !keep.has(k));
  if (unused.length) await env.SAVES.delete(unused);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/"))
      return env.ASSETS.fetch(request as never) as unknown as Promise<Response>;
    if (url.pathname === "/api/health")
      return json({
        ok: true,
        cloudSaves: env.CLOUD_SAVES_ENABLED === "true",
        version: "0.1.0",
      });
    if (
      env.CLOUD_SAVES_ENABLED !== "true" ||
      !env.HYPERDRIVE ||
      !env.SAVES ||
      !env.SUPABASE_URL ||
      !env.SUPABASE_ANON_KEY
    )
      return json(
        {
          error:
            "온라인 저장은 아직 연결되지 않았습니다. 로컬 저장을 이용하세요",
        },
        503,
      );
    let repo: Repository | undefined;
    try {
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin)
        throw new HttpError(403, "다른 출처의 요청은 허용하지 않습니다");
      const owner = await authenticate(request, env);
      repo = await connect(env.HYPERDRIVE.connectionString);
      return await handleApi(request, env, repo, owner);
    } catch (e) {
      return json(
        {
          error:
            e instanceof HttpError
              ? e.message
              : "온라인 저장 처리 실패. 로컬 저장은 유지됩니다",
        },
        e instanceof HttpError ? e.status : 500,
      );
    } finally {
      try {
        await repo?.close();
      } catch {
        // A close failure must not replace the committed response.
      }
    }
  },
  async scheduled(
    _event: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ) {
    if (env.CLOUD_SAVES_ENABLED !== "true" || !env.HYPERDRIVE) return;
    const repo = await connect(env.HYPERDRIVE.connectionString);
    try {
      await cleanup(env, repo);
    } finally {
      await repo.close();
    }
  },
};
