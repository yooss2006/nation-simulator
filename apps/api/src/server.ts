import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import { deserialize } from "../../../packages/simulation-core/src/index";
export interface Save {
  id: string;
  owner: string;
  revision: number;
  snapshot: string;
}
export interface Store {
  list(owner: string): Promise<{ id: string; revision: number }[]>;
  get(id: string, owner: string): Promise<Save | undefined>;
  create(save: Save): Promise<void>;
  update(save: Save, expectedRevision: number): Promise<boolean>;
}
export function buildServer(
  store: Store,
  authenticate: (token: string) => Promise<string | null>,
  origin = "http://localhost:5173",
) {
  const app = Fastify({ bodyLimit: 21_000_000, logger: false });
  app.register(cors, { origin, methods: ["GET", "POST", "PUT"] });
  app.get("/health", async () => ({ ok: true, version: "0.1.0" }));
  app.decorateRequest("owner", "");
  app.addHook("preHandler", async (req, reply) => {
    if (req.url === "/health" || req.method === "OPTIONS") return;
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
      return reply.code(401).send({ error: "인증 필요" });
    const owner = await authenticate(header.slice(7));
    if (!owner) return reply.code(401).send({ error: "인증 실패" });
    (req as typeof req & { owner: string }).owner = owner;
  });
  const body = z
    .object({
      snapshot: z.string().max(20_000_000),
      expectedRevision: z.number().int().nonnegative().optional(),
    })
    .strict();
  const owner = (req: unknown) => (req as { owner: string }).owner;
  app.get("/saves", async (req) => store.list(owner(req)));
  app.get("/saves/:id", async (req, reply) => {
    const save = await store.get((req.params as { id: string }).id, owner(req));
    if (!save)
      return reply.code(404).send({ error: "저장을 찾을 수 없습니다" });
    return save;
  });
  app.post("/saves", async (req, reply) => {
    const parsed = body.parse(req.body);
    deserialize(parsed.snapshot);
    const save = {
      id: randomUUID(),
      owner: owner(req),
      revision: 1,
      snapshot: parsed.snapshot,
    };
    await store.create(save);
    return reply.code(201).send({ id: save.id, revision: save.revision });
  });
  app.put("/saves/:id", async (req, reply) => {
    const parsed = body.parse(req.body);
    if (parsed.expectedRevision === undefined)
      return reply.code(400).send({ error: "expectedRevision 필요" });
    deserialize(parsed.snapshot);
    const id = (req.params as { id: string }).id;
    const current = await store.get(id, owner(req));
    if (!current)
      return reply.code(404).send({ error: "저장을 찾을 수 없습니다" });
    const saved = await store.update(
      {
        id,
        owner: owner(req),
        revision: parsed.expectedRevision + 1,
        snapshot: parsed.snapshot,
      },
      parsed.expectedRevision,
    );
    if (!saved)
      return reply
        .code(409)
        .send({ error: "저장 충돌", current: await store.get(id, owner(req)) });
    return {
      id,
      revision: parsed.expectedRevision + 1,
      checksum: createHash("sha256").update(parsed.snapshot).digest("hex"),
    };
  });
  app.setErrorHandler((error, _, reply) => {
    const bad = error instanceof z.ZodError || error instanceof SyntaxError;
    reply.code(bad ? 400 : 500).send({
      error: bad ? "저장 데이터 형식이 올바르지 않습니다" : "요청 처리 실패",
    });
  });
  return app;
}
