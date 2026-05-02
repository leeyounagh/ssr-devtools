import { randomUUID } from "node:crypto";
import { getGlobalState, rememberSession } from "./registry";
import type { RequestSession } from "./types";

export function getCurrentSession(): RequestSession | null {
  let h: object | null;
  try {
    const mod = require("next/headers") as { headers: () => object };
    h = mod.headers();
  } catch {
    return null;
  }
  if (!h) return null;
  const state = getGlobalState();
  let session = state.sessionByHeaders.get(h);
  if (!session) {
    session = {
      requestId: randomUUID(),
      startedAt: Date.now(),
      entries: [],
    };
    state.sessionByHeaders.set(h, session);
    rememberSession(session);
  }
  return session;
}
