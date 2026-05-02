export interface BodyCapture {
  data: string;
  truncated: boolean;
  byteLength: number;
  contentType: string | null;
}

export interface FetchEntry {
  id: string;
  url: string;
  method: string;
  startedAt: number;
  durationMs: number;
  status: number | null;
  statusText: string | null;
  ok: boolean | null;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody: BodyCapture | null;
  responseBody: BodyCapture | null;
  error: string | null;
}

export interface RequestSession {
  requestId: string;
  startedAt: number;
  entries: FetchEntry[];
}

export interface SSRDevtoolsConfig {
  enabled?: boolean;
  maxBodySize?: number;
  maxSessions?: number;
  redactHeaders?: string[];
  apiPath?: string;
}
