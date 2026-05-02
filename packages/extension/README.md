# SSR DevTools — Chrome extension

DevTools panel that lists Next.js SSR fetch calls captured by
[`@leesuyeon/ssr-devtools`](../server).

## Load locally (unpacked)

1. `chrome://extensions`
2. Toggle **Developer mode**
3. **Load unpacked** → select this folder
4. Open a Next.js dev/staging page that has `@leesuyeon/ssr-devtools` set up
5. Open DevTools (F12) → **SSR Fetches** tab

The panel reads `<script data-ssr-devtools data-ssr-devtools-request-id="…"
data-ssr-devtools-api-path="…">` from the page and queries the API path for
that requestId. No `host_permissions` and no background page — everything runs
through `chrome.devtools.inspectedWindow.eval`.

## Build the icons

The icons are generated from `icons/source.svg`:

```bash
npm install            # at the monorepo root
npm run build:icons    # inside packages/extension
```

Output: `icons/icon{16,48,128}.png` (committed so the extension is loadable
without a build step).

## Build the Chrome Web Store zip

```bash
npm run build:zip      # inside packages/extension
```

Output: `dist/ssr-devtools-v<version>.zip` containing only the runtime files
(manifest, devtools/panel HTML/JS/CSS, three icon PNGs). Submit this at
https://chrome.google.com/webstore/devconsole.
