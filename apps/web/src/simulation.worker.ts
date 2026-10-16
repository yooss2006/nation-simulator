import { generateWorld } from "../../../packages/world-generator/src/index";
import {
  advanceMonth,
  serialize,
  deserialize,
  stateHash,
} from "../../../packages/simulation-core/src/index";
import type {
  World,
  WorkerRequest,
  WorkerResponse,
} from "../../../packages/contracts/src/index";
let world: World | undefined;
self.onmessage = ({ data }: { data: WorkerRequest }) => {
  let result: WorkerResponse;
  try {
    if (data.type === "new")
      world = generateWorld(data.seed, data.difficulty, data.ideology);
    else if (data.type === "load") world = deserialize(data.snapshot);
    else {
      if (!world) throw Error("세계가 없습니다");
      world = advanceMonth(world, data.commands);
    }
    const snapshot = serialize(world);
    result = {
      requestId: data.requestId,
      ok: true,
      snapshot,
      hash: stateHash(snapshot),
    };
  } catch (e) {
    result = {
      requestId: data.requestId,
      ok: false,
      error: e instanceof Error ? e.message : "시뮬레이션 오류",
    };
  }
  self.postMessage(result);
};
