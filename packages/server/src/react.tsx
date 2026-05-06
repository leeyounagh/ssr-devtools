import * as React from "react";
import { patchFetch } from "./patch";
import { getGlobalState } from "./registry";
import { getCurrentSession } from "./session";

export async function SSRDevtoolsScript(): Promise<React.ReactElement | null> {
  const state = getGlobalState();
  if (!state.config.enabled) return null;

  // Self-heal: 매 RSC 렌더 시 fetch 패치 상태 검증.
  // Next.js dev 에서 새 라우트 컴파일 / HMR 로 globalThis.fetch 가 native 로
  // 돌아가는 케이스 방어 — register() 가 cold start 1회만 호출되는 한계 보완.
  patchFetch();

  const session = await getCurrentSession();
  if (!session) return null;

  return (
    <script
      data-ssr-devtools=""
      data-ssr-devtools-request-id={session.requestId}
      data-ssr-devtools-api-path={state.config.apiPath}
    />
  );
}
