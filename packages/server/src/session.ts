import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { getGlobalState, rememberSession } from "./registry";
import type { RequestSession } from "./types";

export async function getCurrentSession(): Promise<RequestSession | null> {
  let h: object | null;
  try {
    const result = headers() as unknown as object | Promise<object>;
    h = result instanceof Promise ? await result : result;
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
