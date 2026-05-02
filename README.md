# ssr-devtools

> **Next.js App Router SSR fetch 디버깅용 Chrome DevTools 익스텐션 + 서버 패키지**

[![npm version](https://img.shields.io/npm/v/@leesuyeon/ssr-devtools.svg?style=flat-square)](https://www.npmjs.com/package/@leesuyeon/ssr-devtools)
[![npm downloads](https://img.shields.io/npm/dm/@leesuyeon/ssr-devtools.svg?style=flat-square)](https://www.npmjs.com/package/@leesuyeon/ssr-devtools)
[![license](https://img.shields.io/npm/l/@leesuyeon/ssr-devtools.svg?style=flat-square)](./LICENSE)

## 빠른 설치

```bash
npm install @leesuyeon/ssr-devtools
```

📦 **npm**: https://www.npmjs.com/package/@leesuyeon/ssr-devtools

설치 후 [통합 가이드](#nextjs-프로젝트에-통합하기)대로 4개 파일에 코드 몇 줄 추가하면 끝.

---

## 문제: SSR 데이터 패칭은 디버깅이 어렵다

Next.js App Router에서 Server Component가 호출하는 `fetch()`는 **Node.js 서버 안에서만** 일어납니다. 브라우저는 그 결과로 만들어진 HTML만 받기 때문에, **개발자 도구의 Network 탭에는 아무것도 찍히지 않습니다.**

그 결과:
- 어떤 URL을 어떤 method로 호출했는지 안 보임
- request/response 헤더를 확인할 수 없음
- response body를 까볼 수가 없음
- 응답 시간(latency)도 모름
- QA/PM 같은 비개발자가 "이 페이지에서 정확히 무슨 데이터를 받아오는지" 확인할 방법이 없음

대안인 `console.log`나 `next.config`의 `logging.fetches.fullUrl`은 터미널에만 찍혀서 비개발자가 못 보고, OpenTelemetry/Sentry는 무겁고 별도 백엔드가 필요합니다.

## 해결: 서버에서 잡아서 → DevTools 패널로

이 프로젝트는 두 부분으로 구성됩니다.

```
┌──────────────────────────────┐         ┌──────────────────────────┐
│  Next.js Node 서버           │         │  브라우저                │
│                              │         │                          │
│  globalThis.fetch 를 패치     │         │   DevTools "SSR Fetches" │
│  → URL/method/status/        │  HTML   │   패널이                 │
│    duration/headers/body     │ ──────► │   <script> 마커에서      │
│    수집                       │         │   requestId 읽고         │
│                              │         │   API 호출 →             │
│  메모리 registry에 세션별     │         │   테이블 + 디테일 렌더    │
│  보관                         │ ◄────── │                          │
│  /api/ssr-devtools 로 조회    │  fetch  │                          │
└──────────────────────────────┘         └──────────────────────────┘
```

**개발자**는 Next.js 앱에 `npm install` 한 번 + 3줄 wiring → 끝.
**비개발자(QA/PM)** 는 Chrome 익스텐션 1번 설치 → DevTools 열고 "SSR Fetches" 탭 클릭 → 끝.

## 어떤 원리로 만들어졌는지

### 1. SSR fetch를 가로채기 — `globalThis.fetch` monkey-patch

Next.js의 `instrumentation.ts` hook은 서버 부팅 시점에 한 번 실행됩니다. 여기서 `globalThis.fetch`를 우리 wrapper로 갈아치웁니다. 이후 Server Component가 부르는 모든 `fetch()`는 우리 wrapper를 거치게 됩니다.

```ts
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const startedAt = Date.now();
  const response = await original(input, init);
  // URL, method, status, duration, headers, body 수집
  recordEntry({ ... });
  return response;
};
```

Body는 stream이라 한 번만 읽을 수 있어서 `response.clone()`으로 복제 후 size limit (기본 100KB) 안에서 읽고 잘라냅니다.

### 2. 같은 요청의 fetch끼리 묶기 — `next/headers` + WeakMap

여러 fetch가 일어나면 어느 요청에 속한 건지 묶어야 합니다. 이게 의외로 까다롭습니다:

- React의 `cache()`는 **route segment별로 스코프가 분리**되어, `app/layout.tsx`와 `app/page.tsx`가 같은 요청 안에서도 다른 cache 인스턴스를 봄 → 못 씀
- Node의 `AsyncLocalStorage`는 우리가 요청 핸들러를 직접 감쌀 방법이 없어서 못 씀

해결책: **`next/headers`의 `headers()` 가 같은 요청 안에서는 같은 Headers 객체 reference를 리턴**한다는 점을 이용해 `WeakMap<Headers, Session>` 으로 키잉합니다.

```ts
function getCurrentSession() {
  const h = headers(); // same reference within one request
  let session = sessionByHeaders.get(h);
  if (!session) {
    session = { requestId: randomUUID(), entries: [] };
    sessionByHeaders.set(h, session);
  }
  return session;
}
```

패치된 fetch도, 곧 설명할 `<SSRDevtoolsScript />` 도 같은 세션을 보게 됩니다.

### 3. 브라우저로 데이터 전달 — `<script>` 마커 + API route

서버에서 모은 데이터를 브라우저로 전달하기 위해 두 부품을 추가합니다.

**`<SSRDevtoolsScript />`** (layout.tsx에 1줄): 렌더 시점의 requestId를 HTML에 박아 넣습니다.
```html
<script data-ssr-devtools data-ssr-devtools-request-id="..." data-ssr-devtools-api-path="/api/ssr-devtools"></script>
```

**`app/api/ssr-devtools/route.ts`**: 그 requestId로 메모리 registry에서 세션을 꺼내 JSON으로 응답합니다.

> 미묘한 포인트: Server Component sibling은 **concurrent 렌더**되어, `<SSRDevtoolsScript />`가 `{children}`의 fetch보다 먼저 렌더될 수 있습니다. 그래도 동작합니다 — 둘이 **같은 세션 객체**(WeakMap에 저장된)를 공유하기 때문에, fetch가 나중에 resolve되면서 `session.entries.push(...)`를 하면 registry의 그 세션이 갱신됩니다. 익스텐션이 API를 부르는 시점엔 이미 채워져 있는 거죠.

### 4. Chrome DevTools 익스텐션

MV3 익스텐션이고 별도 host_permissions가 필요 없습니다 (`chrome.devtools.inspectedWindow.eval`로 페이지 컨텍스트에서 직접 fetch).

```js
// 1. 페이지에서 마커 읽기
const { requestId, apiPath } = readMarker();
// 2. 같은 origin으로 fetch (브라우저가 처리하므로 권한 불필요)
const session = await fetch(apiPath + '?id=' + requestId).then(r => r.json());
// 3. 테이블 + 디테일 패널 렌더
```

페이지 네비게이션 시(`chrome.devtools.network.onNavigated`) 자동 갱신.

## 패키지 구성

| 위치 | 내용 |
|---|---|
| `packages/server/` | `@leesuyeon/ssr-devtools` — Next.js 앱이 설치할 npm 패키지 |
| `packages/extension/` | Chrome MV3 DevTools 익스텐션 |
| `examples/nextjs-demo/` | 동작 검증용 데모 앱 |

## Next.js 프로젝트에 통합하기

> 요구사항: **Next.js 14+ App Router**. 14.x는 `next.config`에 `experimental.instrumentationHook: true` 도 켜야 합니다 (15.0+에서 stable).

### 1. 패키지 설치

```bash
npm install @leesuyeon/ssr-devtools
```

### 2. `instrumentation.ts` (프로젝트 루트)

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { setup } = await import("@leesuyeon/ssr-devtools/instrumentation");
    setup({ enabled: process.env.NODE_ENV !== "production" });
  }
}
```

### 3. `next.config.mjs` (Next 14.x만)

```js
export default {
  experimental: { instrumentationHook: true },
};
```

### 4. `app/layout.tsx`

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

### 5. `app/api/ssr-devtools/route.ts`

```ts
export { GET } from "@leesuyeon/ssr-devtools/route";
```

> 폴더 이름이 `_`로 시작하면 안 됩니다 — App Router가 private folder로 취급해서 라우팅에서 제외됩니다.

## 익스텐션 설치

Chrome Web Store 등록 전까지는:

1. `chrome://extensions` 열기
2. 우측 상단 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드합니다** → `packages/extension/` 폴더 선택
4. Next.js 페이지 열고 DevTools(F12) → **SSR Fetches** 탭

## 사용 시 주의사항

- **첫 페이지 로드** 의 SSR fetch 는 자동으로 잡힙니다 — `<SSRDevtoolsScript />` 가 박은 마커가 초기 렌더 세션 ID 를 들고 있어서 패널 열면 바로 보입니다.
- **그 다음 서버사이드 요청** (Server Action, route handler, `revalidate`, form submit 으로 발생하는 mutation 등) 은 각각 **새 request context** + **새 세션** 으로 실행됩니다. 패널은 이런 요청에 대해 **자동 갱신되지 않으므로**, 서버 액션을 일으킨 뒤 패널의 **Refresh 버튼** 을 눌러야 새 fetch 가 표시됩니다.
- 풀 페이지 네비게이션 시에는 자동 갱신됩니다 (`chrome.devtools.network.onNavigated`). App Router 의 soft client-side 네비게이션은 수동 Refresh 필요.
- 실시간 폴링 / SSE 푸시는 로드맵에 있습니다. 당분간은 Refresh 가 약속.

> **왜 이렇게 동작하나요?** — Next.js 의 모든 서버사이드 요청은 각자 새 `headers()` 객체와 새 request context 에서 실행됩니다. 이 패키지는 `WeakMap<Headers, Session>` 으로 요청별 세션 격리를 하는데, 페이지에 박힌 마커는 초기 렌더의 세션 ID 만 갖고 있어서 후속 server action 의 fetch 는 다른 세션으로 들어갑니다. 패널이 Refresh 시 list-sessions endpoint 까지 조회해서 해당 페이지 로드 이후의 모든 세션을 머지하는 구조입니다.

## 설정 옵션

```ts
setup({
  enabled: true,
  maxBodySize: 100_000,         // bytes; 이상이면 truncate
  maxSessions: 200,             // 메모리에 보관할 최근 세션 수
  redactHeaders: ["authorization", "cookie", "set-cookie", "x-api-key"],
  apiPath: "/api/ssr-devtools", // route.ts 둔 폴더와 일치시킬 것
});
```

## 로컬 개발

```bash
npm install
npm run build               # 서버 패키지 빌드
npm run demo                # 데모 앱 실행 → http://localhost:3000
```

`packages/server/src/*` 수정 후 그 워크스페이스에서 `npm run build` 다시 돌리고, demo는 재시작 (Next.js가 instrumentation 모듈을 부팅 시점에 캐싱).

## 릴리즈 (publish)

`packages/server` 의 `package.json` 버전을 올린 뒤 매칭되는 태그를 푸시하면 GitHub Actions가 `@leesuyeon/ssr-devtools` 를 **public npm registry** 에 자동 publish 합니다.

**최초 1회 셋업**:
1. [npmjs.com](https://www.npmjs.com/signup) 가입
2. Access Tokens → Generate New Token → **Automation** (또는 Granular: scope `@leesuyeon`, permission `Read and write`)
3. GitHub repo → Settings → Secrets and variables → Actions → New secret 이름 `NPM_TOKEN` 으로 그 토큰 등록

**릴리즈할 때마다**:
```bash
# 1. packages/server/package.json 의 "version" 을 0.1.1 로 수정 + 커밋
# 2. 태그 생성 + 푸시
git tag v0.1.1
git push origin v0.1.1
```

태그 버전과 `package.json` 버전이 일치하지 않으면 워크플로가 실패합니다.

## License

MIT
