import { getGlobalState, getSession, listRecentSessions } from "./registry";

export async function GET(req: Request): Promise<Response> {
  const state = getGlobalState();
  if (!state.config.enabled) {
    return jsonResponse({ error: "disabled" }, 404);
  }
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
