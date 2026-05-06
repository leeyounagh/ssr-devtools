import { patchFetch } from "./patch";
import { getGlobalState, getSession, listRecentSessions } from "./registry";

export async function GET(req: Request): Promise<Response> {
  const state = getGlobalState();
  if (!state.config.enabled) {
    return jsonResponse({ error: "disabled" }, 404);
  }
  // Self-heal: extension polling 시점에도 fetch 패치 상태 보장.
  // SSRDevtoolsScript 가 RSC 렌더 안에서 호출 안 되는 라우트가 있어도 안전망.
  patchFetch();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    const session = getSession(id);
    if (!session) return jsonResponse({ error: "not_found" }, 404);
    return jsonResponse(session);
  }
  return jsonResponse({ sessions: listRecentSessions(50) });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
