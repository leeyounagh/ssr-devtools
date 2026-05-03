# @leesuyeon/ssr-devtools

[![npm version](https://img.shields.io/npm/v/@leesuyeon/ssr-devtools.svg?style=flat-square)](https://www.npmjs.com/package/@leesuyeon/ssr-devtools)
[![npm downloads](https://img.shields.io/npm/dm/@leesuyeon/ssr-devtools.svg?style=flat-square)](https://www.npmjs.com/package/@leesuyeon/ssr-devtools)
[![Chrome Web Store](https://img.shields.io/badge/chrome-web%20store-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/nextjs-ssr-devtools/pjnjiopickmfphfiomfondfmbkdhkbnm)
[![license](https://img.shields.io/npm/l/@leesuyeon/ssr-devtools.svg?style=flat-square)](https://github.com/leeyounagh/ssr-devtools/blob/main/LICENSE)

> Inspect **Next.js App Router SSR `fetch()` calls** in Chrome DevTools.
> Companion server package for the SSR DevTools Chrome extension.

🌐 [English](#english) | [한국어](#한국어)

---

## English

### Why

In Next.js App Router, `fetch()` calls inside Server Components run on the
Node.js server. The browser only receives the rendered HTML, so **none of
those fetches show up in the DevTools Network tab** — you can't see URLs,
headers, status codes, durations, or response bodies.

This package patches `globalThis.fetch` on the server, captures every SSR
fetch into an in-memory per-request session, and exposes them through a
small marker `<script>` and an API route. Pair it with the
[SSR DevTools Chrome extension](https://chromewebstore.google.com/detail/nextjs-ssr-devtools/pjnjiopickmfphfiomfondfmbkdhkbnm)
to view captured fetches in a DevTools panel — like the Network tab, but
for SSR.

### Install

**1. Server package** (this package):

```bash
npm install @leesuyeon/ssr-devtools
```

**2. Chrome extension** — pick one:

- **[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/nextjs-ssr-devtools/pjnjiopickmfphfiomfondfmbkdhkbnm)** (recommended)
- Or load unpacked from source: clone [the repo](https://github.com/leeyounagh/ssr-devtools), open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `packages/extension/`.

Requirements: **Next.js 14+** with the **App Router**. On Next 14.x, also
enable `experimental.instrumentationHook: true` in `next.config` (stable
in 15.0+).

### Setup (4 files)

**1. `instrumentation.ts`** at the project root:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { setup } = await import("@leesuyeon/ssr-devtools/instrumentation");
    setup({ enabled: process.env.NODE_ENV !== "production" });
  }
}
```

**2. `next.config.mjs`** (Next 14.x only):

```js
export default {
  experimental: { instrumentationHook: true },
};
```

**3. `app/layout.tsx`** — render the marker inside `<body>`:

```tsx
import { SSRDevtoolsScript } from "@leesuyeon/ssr-devtools/react";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <SSRDevtoolsScript />
      </body>
    </html>
  );
}
```

**4. `app/api/ssr-devtools/route.ts`** — expose the API:

```ts
export { GET } from "@leesuyeon/ssr-devtools/route";
```

> The folder must NOT start with `_` — App Router treats `_*` folders as
> private and excludes them from routing.

That's it. Open a Next.js page, open DevTools, switch to the **SSR
Fetches** panel.

### Usage notes

- **Initial page load** is captured automatically — the marker rendered by
  `<SSRDevtoolsScript />` carries the initial render's session id, so SSR
  fetches that fire during the first render show up in the panel as soon
  as you open it.
- **Subsequent server-side requests** (Server Actions, route handlers,
  `revalidate` calls, mutations triggered by form submits, etc.) execute
  in *new* request contexts with their own sessions. The panel does **not
  auto-refresh** for these — click the **Refresh** button in the panel
  after triggering a server action to merge the new fetches in.
- The panel auto-refreshes on full page navigation
  (`chrome.devtools.network.onNavigated`). Soft client-side navigations
  inside the same document also need a manual Refresh.
- Live polling / SSE push is planned; for now Refresh is the contract.

### Configuration

```ts
setup({
  enabled: true,                // disable in production by default
  maxBodySize: 100_000,         // bytes; bodies above this are truncated
  maxSessions: 200,             // recent sessions kept in memory
  redactHeaders: ["authorization", "cookie", "set-cookie", "x-api-key"],
  apiPath: "/api/ssr-devtools", // must match the folder you put route.ts in
});
```

### How it works (one paragraph)

`setup()` replaces `globalThis.fetch` with a wrapper that records every
call into a per-request session. Sessions are keyed on the Headers object
returned by `next/headers` — the same reference is shared across all code
paths in a single request, which makes it work where React's `cache()`
falls down (it's scoped per route segment, not per request). The
`<SSRDevtoolsScript />` component renders a `<script data-ssr-devtools>`
marker carrying the request id; the API route returns the session for
that id. The Chrome extension reads the marker and hits the API.

→ See the [full README](https://github.com/leeyounagh/ssr-devtools#readme)
for diagrams, tradeoffs, and gotchas.

### License

MIT — see [LICENSE](https://github.com/leeyounagh/ssr-devtools/blob/main/LICENSE).

---

## 한국어

### 왜 필요한가요

Next.js App Router에서 Server Component가 호출하는 `fetch()` 는 Node.js
서버 안에서만 일어납니다. 브라우저는 렌더된 HTML만 받기 때문에 **어떤
SSR fetch도 DevTools의 Network 탭에 보이지 않습니다** — URL, 헤더, 상태
코드, 응답 시간, response body 모두 확인할 길이 없습니다.

이 패키지는 서버에서 `globalThis.fetch` 를 가로채 요청별 세션에 SSR
fetch를 모으고, 작은 `<script>` 마커와 API route로 브라우저에 노출합니다.
[SSR DevTools Chrome 익스텐션](https://chromewebstore.google.com/detail/nextjs-ssr-devtools/pjnjiopickmfphfiomfondfmbkdhkbnm)
과 함께 쓰면 DevTools 패널에서 SSR fetch 목록을 볼 수 있어요 — Network
탭처럼 생긴, 그러나 SSR 전용 패널이라고 보시면 됩니다.

### 설치

**1. 서버 패키지** (이 패키지):

```bash
npm install @leesuyeon/ssr-devtools
```

**2. Chrome 익스텐션** — 둘 중 편한 쪽:

- **[Chrome Web Store에서 설치](https://chromewebstore.google.com/detail/nextjs-ssr-devtools/pjnjiopickmfphfiomfondfmbkdhkbnm)** (권장)
- 또는 소스에서 직접 로드: [저장소](https://github.com/leeyounagh/ssr-devtools)를 clone 후 `chrome://extensions` → **개발자 모드** 켜고 → **압축해제된 확장 프로그램을 로드합니다** → `packages/extension/` 폴더 선택.

요구사항: **Next.js 14+** + **App Router**. 14.x는 `next.config` 에
`experimental.instrumentationHook: true` 도 켜야 합니다 (15.0+ 부터
stable).

### 설정 (파일 4개)

**1. 프로젝트 루트의 `instrumentation.ts`**:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { setup } = await import("@leesuyeon/ssr-devtools/instrumentation");
    setup({ enabled: process.env.NODE_ENV !== "production" });
  }
}
```

**2. `next.config.mjs`** (Next 14.x 만):

```js
export default {
  experimental: { instrumentationHook: true },
};
```

**3. `app/layout.tsx`** — `<body>` 안에 마커 렌더:

```tsx
import { SSRDevtoolsScript } from "@leesuyeon/ssr-devtools/react";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <SSRDevtoolsScript />
      </body>
    </html>
  );
}
```

**4. `app/api/ssr-devtools/route.ts`** — API 노출:

```ts
export { GET } from "@leesuyeon/ssr-devtools/route";
```

> 폴더 이름이 `_` 로 시작하면 안 됩니다 — App Router 가 private folder
> 로 취급해서 라우팅에서 제외됩니다.

끝입니다. Next.js 페이지 열고 DevTools 열어서 **SSR Fetches** 탭 클릭하세요.

### 사용 시 주의사항

- **첫 페이지 로드** 의 SSR fetch 는 자동으로 잡힙니다 — `<SSRDevtoolsScript />`
  가 박은 마커가 초기 렌더 세션 ID 를 들고 있어서 패널 열면 바로 보입니다.
- **그 다음 서버사이드 요청** (Server Action, route handler, `revalidate`
  호출, form submit 으로 발생하는 mutation 등) 은 각각 **새 request
  context** + **새 세션** 으로 실행됩니다. 패널은 이런 요청에 대해
  **자동 갱신되지 않으므로**, 서버 액션을 일으킨 뒤 패널의
  **Refresh 버튼** 을 눌러야 새 fetch 가 표시됩니다.
- 풀 페이지 네비게이션 시에는 자동 갱신됩니다
  (`chrome.devtools.network.onNavigated`). App Router 의 soft
  client-side 네비게이션은 수동 Refresh 필요.
- 실시간 폴링 / SSE 푸시는 로드맵에 있습니다. 당분간은 Refresh 가 약속.

### 설정 옵션

```ts
setup({
  enabled: true,                // production은 기본 비활성
  maxBodySize: 100_000,         // bytes; 초과 시 truncate
  maxSessions: 200,             // 메모리에 보관할 최근 세션 수
  redactHeaders: ["authorization", "cookie", "set-cookie", "x-api-key"],
  apiPath: "/api/ssr-devtools", // route.ts 둔 폴더와 일치시킬 것
});
```

### 동작 원리 (한 문단)

`setup()` 은 `globalThis.fetch` 를 우리 wrapper로 갈아치워서 모든 호출을
요청별 세션에 기록합니다. 세션 키는 `next/headers` 의 Headers 객체 — 한
요청 내 모든 코드 경로에서 같은 reference 라서, route segment 별로 분리되는
React `cache()` 와 달리 layout/page 사이에서도 같은 세션을 봅니다.
`<SSRDevtoolsScript />` 는 request id 가 박힌 `<script data-ssr-devtools>`
를 렌더하고, API route 는 그 id 로 세션을 돌려줍니다. Chrome 익스텐션이
마커에서 id 읽어 API 를 호출하는 구조.

→ 다이어그램, 트레이드오프, 함정 등 전체 설명은
[전체 README](https://github.com/leeyounagh/ssr-devtools/blob/main/README.md)
참고.

### 라이선스

MIT — [LICENSE](https://github.com/leeyounagh/ssr-devtools/blob/main/LICENSE) 참조.
