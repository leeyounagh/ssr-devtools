import { getGlobalState } from "./registry";
import { patchFetch } from "./patch";
import type { SSRDevtoolsConfig } from "./types";

export function setup(config: SSRDevtoolsConfig = {}): void {
  const state = getGlobalState();
  state.config = { ...state.config, ...config };
  if (!state.config.enabled) return;
  patchFetch();
}

export type { SSRDevtoolsConfig } from "./types";
