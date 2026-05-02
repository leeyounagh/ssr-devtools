import type { RequestSession, SSRDevtoolsConfig } from "./types";

const REGISTRY_KEY = Symbol.for("@leesuyeon/ssr-devtools/registry");

interface GlobalState {
  sessions: Map<string, RequestSession>;
  sessionByHeaders: WeakMap<object, RequestSession>;
  config: Required<SSRDevtoolsConfig>;
  patched: boolean;
}

const DEFAULT_CONFIG: Required<SSRDevtoolsConfig> = {
  enabled: process.env.NODE_ENV !== "production",
  maxBodySize: 100_000,
  maxSessions: 200,
  redactHeaders: ["authorization", "cookie", "set-cookie", "x-api-key"],
  apiPath: "/api/ssr-devtools",
};

export function getGlobalState(): GlobalState {
  const g = globalThis as unknown as Record<symbol, GlobalState>;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = {
      sessions: new Map(),
      sessionByHeaders: new WeakMap(),
      config: { ...DEFAULT_CONFIG },
      patched: false,
    };
  }
  return g[REGISTRY_KEY];
}

export function rememberSession(session: RequestSession): void {
  const state = getGlobalState();
  state.sessions.set(session.requestId, session);
  while (state.sessions.size > state.config.maxSessions) {
    const oldest = state.sessions.keys().next().value;
    if (!oldest) break;
    state.sessions.delete(oldest);
  }
}

export function getSession(id: string): RequestSession | undefined {
  return getGlobalState().sessions.get(id);
}

export function listRecentSessions(limit = 50): RequestSession[] {
  const all = Array.from(getGlobalState().sessions.values());
  return all.slice(-limit).reverse();
}
