import * as React from "react";
import { getGlobalState } from "./registry";
import { getCurrentSession } from "./session";

export function SSRDevtoolsScript(): React.ReactElement | null {
  const state = getGlobalState();
  if (!state.config.enabled) return null;

  const session = getCurrentSession();
  if (!session) return null;

  return (
    <script
      data-ssr-devtools=""
      data-ssr-devtools-request-id={session.requestId}
      data-ssr-devtools-api-path={state.config.apiPath}
    />
  );
}
