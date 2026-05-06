import type { RequestSession, SSRDevtoolsConfig } from "./types";

const REGISTRY_KEY = Symbol.for("@leesuyeon/ssr-devtools/registry");

interface GlobalState {
  sessions: Map<string, RequestSession>;
  sessionByHeaders: WeakMap<object, RequestSession>;
  config: Required<SSRDevtoolsConfig>;
  patched: boolean;
  /**
   * 우리가 globalThis.fetch 에 설치한 wrapper 참조.
   * Next.js dev (Turbopack / HMR) 에서 globalThis.fetch 가 native 로 reset 되거나
   * 새 RSC isolate 가 생성되는 케이스를 감지하기 위한 sentinel —
   * patchFetch() 가 `globalThis.fetch === state.wrapped` 인지 검증해 self-heal.
   */
  wrapped: typeof fetch | null;
  /**
   * 첫 patch 시점의 원본 fetch.
   * re-patch 가 발생해도 원본을 잃지 않게 보존 → wrapper 가 wrapper 를 호출하는
   * 무한 재귀 방지.
   */
  original: typeof fetch | null;
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
      wrapped: null,
      original: null,
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
