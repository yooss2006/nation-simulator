import { Pool } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gzipSync, gunzipSync } from "node:zlib";
import { randomUUID, createHash } from "node:crypto";
import type { Save, Store } from "./server";
/** Immutable objects ensure concurrent uploads never overwrite either snapshot. */
export class PostgresObjectStore implements Store {
  constructor(
    private pool: Pool,
    private storage: SupabaseClient,
    private bucket: string,
  ) {}
  async list(owner: string) {
    return (
      await this.pool.query(
        "SELECT id, revision FROM saves WHERE owner_id=$1 ORDER BY id",
        [owner],
      )
    ).rows;
  }
  async get(id: string, owner: string): Promise<Save | undefined> {
    const { rows } = await this.pool.query(
      "SELECT * FROM saves WHERE id=$1 AND owner_id=$2",
      [id, owner],
    );
    if (!rows.length) return;
    const row = rows[0];
    const { data, error } = await this.storage.storage
      .from(this.bucket)
      .download(row.snapshot_key);
    if (error || !data) throw Error("Snapshot download failed");
    const snapshot = gunzipSync(Buffer.from(await data.arrayBuffer()), {
      maxOutputLength: 20_000_000,
    }).toString("utf8");
    if (createHash("sha256").update(snapshot).digest("hex") !== row.checksum)
      throw Error("Snapshot checksum mismatch");
    return { id: row.id, owner, revision: row.revision, snapshot };
  }
  private async upload(s: Save) {
    const key = `${s.owner}/${s.id}/${randomUUID()}.json.gz`;
    const { error } = await this.storage.storage
      .from(this.bucket)
      .upload(key, gzipSync(s.snapshot), {
        contentType: "application/gzip",
        upsert: false,
      });
    if (error) throw error;
    return {
      key,
      checksum: createHash("sha256").update(s.snapshot).digest("hex"),
    };
  }
  async create(s: Save) {
    const { key, checksum } = await this.upload(s);
    await this.pool.query(
      "INSERT INTO saves(id,owner_id,revision,snapshot_key,checksum) VALUES($1,$2,$3,$4,$5)",
      [s.id, s.owner, s.revision, key, checksum],
    );
  }
  async update(s: Save, expected: number) {
    const { key, checksum } = await this.upload(s);
    const result = await this.pool.query(
      "UPDATE saves SET revision=$1,snapshot_key=$2,checksum=$3 WHERE id=$4 AND owner_id=$5 AND revision=$6",
      [s.revision, key, checksum, s.id, s.owner, expected],
    );
    return result.rowCount === 1;
  }
}
