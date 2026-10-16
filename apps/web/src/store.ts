import { create } from "zustand";
import type { World, Command } from "../../../packages/contracts/src/index";
export const useGame = create<{
  world: World | null;
  busy: boolean;
  error: string;
  queue: Command[];
  selected: string | null;
  set: (
    value: Partial<{
      world: World | null;
      busy: boolean;
      error: string;
      queue: Command[];
      selected: string | null;
    }>,
  ) => void;
}>((set) => ({
  world: null,
  busy: false,
  error: "",
  queue: [],
  selected: null,
  set,
}));
