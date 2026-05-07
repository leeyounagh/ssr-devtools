import { randomUUID } from "node:crypto";
import { getGlobalState } from "./registry";
import { getCurrentSession } from "./session";
import type { BodyCapture, FetchEntry } from "./types";

function readHeaders(
  source: HeadersInit | Headers | undefined,
  redact: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!source) return out;
  const redactSet = new Set(redact.map((s) => s.toLowerCase()));
  const set = (k: string, v: string) => {
    out[k] = redactSet.has(k.toLowerCase()) ? "[REDACTED]" : v;
  };
  if (source instanceof Headers) {
    source.forEach((v, k) => set(k, v));
  } else if (Array.isArray(source)) {
    for (const [k, v] of source) set(k, String(v));
  } else {
    for (const [k, v] of Object.entries(source)) set(k, String(v));
  }
  return out;
}

function isTextLike(contentType: string | null): boolean {
  if (!contentType) return true;
  const ct = contentType.toLowerCase();
  return (
    ct.includes("text") ||
    ct.includes("json") ||
    ct.includes("xml") ||
    ct.includes("javascript") ||
    ct.includes("html") ||
    ct.includes("urlencoded")
  );
}

function mergeChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

async function captureResponseBody(
  response: Response,
  maxBytes: number,
): Promise<BodyCapture | null> {
  if (!response.body) return null;
  const cloned = response.clone();
  const contentType = cloned.headers.get("content-type");
  try {
    const reader = cloned.body!.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        const overshoot = total - maxBytes;
        const keep = value.byteLength - overshoot;
        if (keep > 0) chunks.push(value.subarray(0, keep));
        truncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const merged = mergeChunks(chunks);
    const data = isTextLike(contentType)
      ? new TextDecoder().decode(merged)
      : `[binary ${total} bytes]`;
    return { data, truncated, byteLength: total, contentType };
  } catch (err) {
    return {
      data: `[read error: ${(err as Error).message}]`,
      truncated: false,
      byteLength: 0,
      contentType,
    };
  }
}

async function captureRequestBody(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  maxBytes: number,
): Promise<BodyCapture | null> {
  const body = init?.body;
  if (body != null) {
    if (typeof body === "string") {
      const truncated = body.length > maxBytes;
      return {
        data: truncated ? body.slice(0, maxBytes) : body,
        truncated,
        byteLength: body.length,
        contentType: null,
      };
    }
    if (body instanceof URLSearchParams) {
      const s = body.toString();
      return {
        data: s,
        truncated: false,
        byteLength: s.length,
        contentType: "application/x-www-form-urlencoded",
      };
    }
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      const obj: Record<string, string> = {};
      for (const [k, v] of body.entries()) {
        obj[k] = typeof v === "string" ? v : `[file: ${(v as File).name}]`;
      }
      return {
        data: JSON.stringify(obj),
        truncated: false,
        byteLength: 0,
        contentType: "multipart/form-data",
      };
    }
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      const len =
        body instanceof ArrayBuffer ? body.byteLength : body.byteLength ?? 0;
      return { data: "[binary]", truncated: false, byteLength: len, contentType: null };
    }
    if (typeof Blob !== "undefined" && body instanceof Blob) {
      return {
        data: "[blob]",
        truncated: false,
        byteLength: body.size,
        contentType: body.type || null,
      };
    }
    if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
      return { data: "[stream]", truncated: false, byteLength: 0, contentType: null };
    }
    return { data: "[unknown body type]", truncated: false, byteLength: 0, contentType: null };
  }

  // Fallback: ky / axios 등 일부 fetch 클라이언트는 `fetch(request, options)`
  // 형태로 호출하며, 이 경우 body 는 init 이 아닌 첫 인자 Request 객체에 들어간다.
  // init.body 가 비어있어도 input 이 Request 면 거기서 body 를 추출해 PUT/POST/PATCH
  // 페이로드를 캡처한다.
  //
  // ⚠️ cloned.text() 로 body 를 끝까지 읽으면 큰 페이로드일 때 caller upstream
  // fetch 시작이 지연되어 ky/axios timeout 으로 끊기는 회귀 발생. captureResponseBody
  // 와 동일하게 streaming + maxBytes cap + cancel 로 caller blocking 시간을 body
  // 크기와 무관한 상수 수준으로 묶는다.
  if (typeof Request !== "undefined" && input instanceof Request && input.body) {
    const cloned = input.clone();
    const contentType = cloned.headers.get("content-type");
    try {
      const reader = cloned.body!.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      let truncated = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          const overshoot = total - maxBytes;
          const keep = value.byteLength - overshoot;
          if (keep > 0) chunks.push(value.subarray(0, keep));
          truncated = true;
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
      const merged = mergeChunks(chunks);
      const data = isTextLike(contentType)
        ? new TextDecoder().decode(merged)
        : `[binary ${total} bytes]`;
      return { data, truncated, byteLength: total, contentType };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Server action / 사용자 정의 server-side 진입점에서 self-heal 을 보장하기 위한
 * public alias. `<SSRDevtoolsScript/>` 와 `GET` 핸들러를 거치지 않는 컨텍스트
 * (예: 'use server' module 의 ky/fetch 호출) 에서 호출하면, 해당 isolate 의
 * globalThis.fetch 가 native 인 경우 즉시 wrapper 로 재패치한다.
 *
 * 권장 호출 위치: server-side API 클라이언트 factory (ky.create 등) 내부.
 */
export function ensurePatched(): void {
  patchFetch();
}

export function patchFetch(): void {
  const state = getGlobalState();
  if (!state.config.enabled) return;

  // Self-healing: globalThis.fetch 가 우리 wrapper 그대로면 이미 패치 상태 — skip.
  // Turbopack / HMR 로 reset 됐거나 새 RSC isolate 라면 다시 패치.
  if (state.wrapped && globalThis.fetch === state.wrapped) return;

  // 첫 patch 시 원본 보존. 이전에 patch 한 적이 있다면 보존된 original 을 재사용해
  // wrapper 가 wrapper 를 호출하는 무한 재귀 방지.
  const original = state.original ?? globalThis.fetch;
  if (!original) return;
  state.original = original;

  const wrapped: typeof fetch = async (input, init) => {
    const config = state.config;
    const startedAt = Date.now();
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const reqHeadersSource =
      (init?.headers as HeadersInit | undefined) ??
      (input instanceof Request ? input.headers : undefined);
    const requestHeaders = readHeaders(reqHeadersSource, config.redactHeaders);
    const requestBody = await captureRequestBody(input, init, config.maxBodySize);
    const id = randomUUID();

    let response: Response;
    try {
      response = await original(input as RequestInfo | URL, init);
    } catch (err) {
      const entry: FetchEntry = {
        id,
        url,
        method,
        startedAt,
        durationMs: Date.now() - startedAt,
        status: null,
        statusText: null,
        ok: null,
        requestHeaders,
        responseHeaders: {},
        requestBody,
        responseBody: null,
        error: (err as Error).message,
      };
      (await getCurrentSession())?.entries.push(entry);
      throw err;
    }

    // ⚠️ caller 응답 path 를 차단하지 않도록 body capture 는 백그라운드로 분리.
    // 큰 응답 (예: organization tree-with-employees 수십 MB) 의 경우 cloned stream 을
    // 끝까지 읽는 데 수십 초가 걸려, 여기서 await 하면 caller 측 fetch client (ky 등)
    // 의 timeout 이 먼저 발동해 정상 응답이 끊기는 회귀 발생 (2026-05-07).
    // response 는 즉시 caller 에게 반환하고 body capture 는 별도 promise 로 진행.
    const durationMs = Date.now() - startedAt;
    const responseHeaders = readHeaders(response.headers, config.redactHeaders);
    captureResponseBody(response, config.maxBodySize)
      .then(async (responseBody) => {
        const entry: FetchEntry = {
          id,
          url,
          method,
          startedAt,
          durationMs,
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          requestHeaders,
          responseHeaders,
          requestBody,
          responseBody,
          error: null,
        };
        (await getCurrentSession())?.entries.push(entry);
      })
      .catch(() => {
        // body capture 실패해도 caller 응답엔 영향 없음 — silent skip.
      });
    return response;
  };

  globalThis.fetch = wrapped;
  state.wrapped = wrapped;
  state.patched = true;
}
