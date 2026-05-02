# SSR DevTools — Chrome extension

DevTools panel that lists Next.js SSR fetch calls captured by
[`@leeyounagh/ssr-devtools`](../server).

## Load locally

1. `chrome://extensions`
2. Toggle **Developer mode**
3. **Load unpacked** → select this folder
4. Open a Next.js dev/staging page that has `@leeyounagh/ssr-devtools` set up
5. Open DevTools (F12) → **SSR Fetches** tab

The panel reads `<script data-ssr-devtools data-ssr-devtools-request-id="…"
data-ssr-devtools-api-path="…">` from the page and queries the API path for
that requestId. No host permissions or background page needed.

## Publishing to the Chrome Web Store (later)

1. Add 16/48/128 px icons (`icons/icon{16,48,128}.png`) and reference them in
   `manifest.json`.
2. Bump `version` in `manifest.json`.
3. Zip the contents of this folder (not the folder itself).
4. Submit at https://chrome.google.com/webstore/devconsole.
