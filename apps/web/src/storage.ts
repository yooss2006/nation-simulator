import { openDB } from "idb";
import {
  deserialize,
  stateHash,
} from "../../../packages/simulation-core/src/index";
export interface LocalSave {
  snapshot: string;
  hash: string;
  cloudRevision: number;
  pending: boolean;
}
const db = () =>
  openDB("nation-simulator", 1, {
    upgrade(db) {
      db.createObjectStore("saves");
    },
  });
export async function saveLocal(id: string, save: LocalSave) {
  deserialize(save.snapshot);
  const d = await db();
  await d.put("saves", save, id);
}
export async function loadLocal(id: string): Promise<LocalSave | undefined> {
  const d = await db();
  const s = await d.get("saves", id);
  if (s) {
    if (stateHash(s.snapshot) !== s.hash)
      throw Error("저장 파일 체크섬 불일치");
    deserialize(s.snapshot);
  }
  return s;
}
