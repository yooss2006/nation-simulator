import { Client } from "pg";
import type { Repository, Metadata } from "./types";
export class PostgresRepository implements Repository {
  constructor(private db: Client) {}
  async list(owner: string) {
    return (
      await this.db.query(
        "SELECT id,revision FROM cloud_saves WHERE owner_id=$1 ORDER BY id",
        [owner],
      )
    ).rows;
  }
  async get(id: string, owner: string): Promise<Metadata | undefined> {
    return (
      await this.db.query(
        "SELECT * FROM cloud_saves WHERE id=$1 AND owner_id=$2",
        [id, owner],
      )
    ).rows[0];
  }
  async consume(owner: string, write: boolean) {
    const { rows } = await this.db.query(
      "SELECT consume_cloud_quota($1,$2) AS allowed",
      [owner, write],
    );
    return rows[0].allowed === true;
  }
  async commit(
    owner: string,
    id: string,
    expected: number,
    key: string,
    checksum: string,
    bytes: number,
  ) {
    const { rows } = await this.db.query(
      "SELECT commit_cloud_save($1,$2,$3,$4,$5,$6) AS result",
      [owner, id, expected, key, checksum, bytes],
    );
    return rows[0].result;
  }
  async referenced(keys: string[]) {
    if (!keys.length) return [];
    const { rows } = await this.db.query(
      "SELECT snapshot_key,previous_key FROM cloud_saves WHERE snapshot_key=ANY($1::text[]) OR previous_key=ANY($1::text[])",
      [keys],
    );
    return rows.flatMap((r) =>
      [r.snapshot_key, r.previous_key].filter(Boolean),
    );
  }
  async close() {
    await this.db.end();
  }
}
export async function connect(connectionString: string) {
  const db = new Client({ connectionString });
  await db.connect();
  return new PostgresRepository(db);
}
