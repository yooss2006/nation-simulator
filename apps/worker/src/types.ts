import type { R2Bucket, Fetcher, Hyperdrive } from "@cloudflare/workers-types";
export interface Env {
  ASSETS: Fetcher;
  SAVES: R2Bucket;
  HYPERDRIVE?: Hyperdrive;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  ALLOWED_USER_IDS?: string;
  CLOUD_SAVES_ENABLED?: string;
}
export const LIMITS = {
  compressedBytes: 1_048_576,
  expandedBytes: 8_388_608,
  slots: 3,
  dailyWrites: 30,
  dailyReads: 300,
  testers: 10,
  globalSlots: 30,
};
export interface Metadata {
  id: string;
  owner_id: string;
  revision: number;
  snapshot_key: string;
  previous_key: string | null;
  checksum: string;
  byte_size: number;
}
export interface Repository {
  list(owner: string): Promise<{ id: string; revision: number }[]>;
  get(id: string, owner: string): Promise<Metadata | undefined>;
  consume(owner: string, write: boolean): Promise<boolean>;
  commit(
    owner: string,
    id: string,
    expected: number,
    key: string,
    checksum: string,
    bytes: number,
  ): Promise<{ ok: boolean; oldKey?: string; reason?: "conflict" | "quota" }>;
  referenced(keys: string[]): Promise<string[]>;
  close(): Promise<void>;
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
