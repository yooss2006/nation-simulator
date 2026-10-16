import { Pool } from "pg";
import { createClient } from "@supabase/supabase-js";
import { buildServer } from "./server";
import { PostgresObjectStore } from "./store";
for (const key of [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WEB_ORIGIN",
])
  if (!process.env[key]) throw Error(`Missing ${key}`);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const app = buildServer(
  new PostgresObjectStore(
    pool,
    supabase,
    process.env.SUPABASE_BUCKET || "nation-saves",
  ),
  async (token) => {
    const { data, error } = await supabase.auth.getUser(token);
    return error ? null : (data.user?.id ?? null);
  },
  process.env.WEB_ORIGIN,
);
app.addHook("onClose", async () => {
  await pool.end();
});
await app.listen({ port: Number(process.env.PORT || 3001), host: "0.0.0.0" });
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    void app.close();
  });
