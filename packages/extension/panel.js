const els = {
  rows: document.getElementById("rows"),
  empty: document.getElementById("empty"),
  status: document.getElementById("status"),
  refresh: document.getElementById("refresh"),
  clear: document.getElementById("clear"),
  detail: document.getElementById("detail"),
};

let state = {
  entries: [],
  selectedId: null,
  detailTab: "general",
};

function evalInPage(expression) {
  return new Promise((resolve, reject) => {
    chrome.devtools.inspectedWindow.eval(expression, (result, errInfo) => {
      if (errInfo && (errInfo.isError || errInfo.isException)) {
        reject(new Error(errInfo.value || errInfo.description || "eval failed"));
      } else {
        resolve(result);
      }
    });
  });
}

async function readMarker() {
  return evalInPage(`(() => {
    const el = document.querySelector('script[data-ssr-devtools]');
    if (!el) return null;
    return {
      requestId: el.getAttribute('data-ssr-devtools-request-id'),
      apiPath: el.getAttribute('data-ssr-devtools-api-path'),
    };
  })()`);
}

// chrome.devtools.inspectedWindow.eval does not await Promises — it serializes
// whatever the expression returns synchronously, so an async IIFE comes back
// as `{}`. Use synchronous XHR so the eval expression returns the parsed JSON
// directly. Sync XHR is deprecated but works in the main thread, which is
// where evaluated expressions run.
function syncFetchExpr(url) {
  return `(() => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', ${JSON.stringify(url)}, false);
    try { xhr.send(); } catch (e) { throw new Error('network error: ' + e.message); }
    if (xhr.status !== 200) throw new Error('status ' + xhr.status);
    try { return JSON.parse(xhr.responseText); } catch (e) { throw new Error('parse error: ' + e.message); }
  })()`;
}

async function fetchSession(apiPath, requestId) {
  return evalInPage(
    syncFetchExpr(apiPath + "?id=" + encodeURIComponent(requestId)),
  );
}

async function fetchAllSessions(apiPath) {
  return evalInPage(syncFetchExpr(apiPath));
}

// Server action / mutation 흐름은 page session 보다 *먼저* 시작했지만 user
// 입장에서는 "지금 보고 있는 페이지의 일부" 인 경우가 많다. 예시:
//   1. page A 진입 → marker session S_a (t=100)
//   2. DELETE click → server action session S_x (t=120, S_a 와 무관한 새 isolate)
//   3. router.refresh() 또는 push(samePath) → 새 page session S_b (t=125) 가
//      markerSessionStartedAt 이 됨
//   → S_x.startedAt(120) < S_b.startedAt(125) 라 가드에 걸려 panel 에서 사라짐.
// marker session 시작 직전 N 초 내에 시작한 sessions 도 같이 보여 server action
// 흐름이 navigation 으로 잘려도 추적 가능하게 한다.
const SERVER_ACTION_LOOKBACK_MS = 60_000;
// Manual refresh 외 자동 polling — `chrome.devtools.network.onNavigated` 가
// router.refresh() / server action 후의 RSC re-render 에 일관되게 발화하지 않아,
// 사용자가 DELETE 하고 페이지에 머무를 때 panel 이 stale 인 상태가 됨.
const AUTO_REFRESH_INTERVAL_MS = 2_000;

async function refresh() {
  setStatus("Loading…");
  try {
    const marker = await readMarker();
    if (!marker || !marker.requestId || !marker.apiPath) {
      state.entries = [];
      render();
      setStatus("No marker on page. Add <SSRDevtoolsScript /> and reload.");
      return;
    }
    // Fetch the marker's session (initial GET) AND the recent-sessions list.
    // Server actions / mutations (POST, PUT, DELETE, …) execute in NEW server
    // request contexts with NEW headers, so their fetches end up in fresh
    // sessions whose ids the page DOM doesn't know about. To surface those,
    // we merge the marker session with all other sessions started within the
    // [marker.startedAt - LOOKBACK, ∞) window — covering both server actions
    // that ran *before* the latest RSC re-render and any newer follow-ups.
    const [markerSession, all] = await Promise.all([
      fetchSession(marker.apiPath, marker.requestId).catch(() => null),
      fetchAllSessions(marker.apiPath).catch(() => ({ sessions: [] })),
    ]);
    const markerSessionStartedAt =
      markerSession?.startedAt ?? Number.MIN_SAFE_INTEGER;
    const lowerBound = markerSessionStartedAt - SERVER_ACTION_LOOKBACK_MS;
    const seen = new Set();
    const merged = [];
    const addEntries = (session) => {
      if (!session) return;
      for (const e of session.entries ?? []) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        merged.push(e);
      }
    };
    addEntries(markerSession);
    for (const s of all?.sessions ?? []) {
      if (s.requestId === marker.requestId) continue;
      if ((s.startedAt ?? 0) < lowerBound) continue;
      addEntries(s);
    }
    merged.sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
    state.entries = merged;
    render();
    const ts = new Date().toLocaleTimeString();
    setStatus(`${state.entries.length} fetch(es) · updated ${ts}`);
  } catch (err) {
    setStatus("Error: " + err.message);
  }
}

function setStatus(text) {
  els.status.textContent = text;
}

function clear() {
  state.entries = [];
  state.selectedId = null;
  render();
  setStatus("Cleared (will repopulate on next refresh).");
}

function statusClass(entry) {
  if (entry.error) return "status-err";
  const s = entry.status;
  if (s == null) return "";
  if (s >= 500) return "status-5xx";
  if (s >= 400) return "status-4xx";
  if (s >= 300) return "status-3xx";
  if (s >= 200) return "status-2xx";
  return "";
}

function methodClass(method) {
  return "method-" + method;
}

function formatDuration(ms) {
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return ms + " ms";
  return (ms / 1000).toFixed(2) + " s";
}

function formatSize(bytes) {
  if (bytes == null || bytes === 0) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

function shortUrl(url) {
  try {
    const u = new URL(url, "http://placeholder.invalid/");
    if (u.hostname === "placeholder.invalid") return url;
    return u.host + u.pathname + (u.search || "");
  } catch {
    return url;
  }
}

function render() {
  els.rows.innerHTML = "";
  if (state.entries.length === 0) {
    els.empty.style.display = "";
  } else {
    els.empty.style.display = "none";
  }
  for (const entry of state.entries) {
    const tr = document.createElement("tr");
    tr.dataset.id = entry.id;
    if (entry.id === state.selectedId) tr.classList.add("selected");
    tr.innerHTML = `
      <td><span class="method ${methodClass(entry.method)}">${escapeHtml(entry.method)}</span></td>
      <td class="${statusClass(entry)}">${
        entry.error ? "ERR" : entry.status ?? ""
      }</td>
      <td class="url-cell" title="${escapeAttr(entry.url)}">${escapeHtml(shortUrl(entry.url))}</td>
      <td>${formatDuration(entry.durationMs)}</td>
      <td>${formatSize(entry.responseBody?.byteLength ?? null)}</td>
    `;
    tr.addEventListener("click", () => selectEntry(entry.id));
    els.rows.appendChild(tr);
  }
  renderDetail();
}

function selectEntry(id) {
  state.selectedId = id;
  for (const tr of els.rows.querySelectorAll("tr")) {
    tr.classList.toggle("selected", tr.dataset.id === id);
  }
  renderDetail();
}

function renderDetail() {
  const entry = state.entries.find((e) => e.id === state.selectedId);
  if (!entry) {
    els.detail.innerHTML = `<div class="placeholder">Select a row to see details</div>`;
    return;
  }
  const tab = state.detailTab;
  els.detail.innerHTML = `
    <div class="detail-tabs">
      ${tabBtn("general", "General", tab)}
      ${tabBtn("headers", "Headers", tab)}
      ${tabBtn("request", "Request body", tab)}
      ${tabBtn("response", "Response body", tab)}
    </div>
    <div class="detail-body" id="detail-body"></div>
  `;
  for (const btn of els.detail.querySelectorAll(".detail-tab")) {
    btn.addEventListener("click", () => {
      state.detailTab = btn.dataset.tab;
      renderDetail();
    });
  }
  const body = document.getElementById("detail-body");
  if (tab === "general") body.appendChild(renderGeneral(entry));
  else if (tab === "headers") body.appendChild(renderHeaders(entry));
  else if (tab === "request") body.appendChild(renderBody(entry.requestBody));
  else if (tab === "response") body.appendChild(renderBody(entry.responseBody));
}

function tabBtn(id, label, active) {
  return `<button class="detail-tab ${id === active ? "active" : ""}" data-tab="${id}">${label}</button>`;
}

function renderGeneral(entry) {
  const root = document.createElement("div");
  const rows = [
    ["URL", entry.url],
    ["Method", entry.method],
    ["Status", entry.error ? "ERROR — " + entry.error : `${entry.status} ${entry.statusText ?? ""}`],
    ["Duration", formatDuration(entry.durationMs)],
    ["Started", new Date(entry.startedAt).toISOString()],
    ["Response size", formatSize(entry.responseBody?.byteLength ?? null)],
  ];
  root.appendChild(kv(rows));
  return root;
}

function renderHeaders(entry) {
  const root = document.createElement("div");
  root.appendChild(section("Request headers", kv(Object.entries(entry.requestHeaders))));
  root.appendChild(section("Response headers", kv(Object.entries(entry.responseHeaders))));
  return root;
}

function renderBody(capture) {
  const root = document.createElement("div");
  if (!capture) {
    root.innerHTML = `<div class="placeholder">No body</div>`;
    return root;
  }
  const meta = document.createElement("div");
  meta.className = "detail-section";
  meta.innerHTML = `
    <h3>Meta</h3>
    <div class="kv">
      <span class="k">Content-Type</span><span>${escapeHtml(capture.contentType ?? "—")}</span>
      <span class="k">Size</span><span>${formatSize(capture.byteLength)}</span>
      ${
        capture.truncated
          ? `<span class="k">Truncated</span><span>yes (showing first ${formatSize(capture.data.length)})</span>`
          : ""
      }
    </div>
  `;
  root.appendChild(meta);
  const bodyText = prettify(capture.data, capture.contentType);
  const wrap = document.createElement("div");
  wrap.className = "body-wrap";
  const toolbar = document.createElement("div");
  toolbar.className = "body-toolbar";
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "copy-btn";
  copyBtn.title = "Copy to clipboard";
  copyBtn.setAttribute("aria-label", "Copy body to clipboard");
  copyBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
    <span class="copy-label">Copy</span>
  `;
  copyBtn.addEventListener("click", () => copyToClipboard(bodyText, copyBtn));
  toolbar.appendChild(copyBtn);
  wrap.appendChild(toolbar);
  const pre = document.createElement("pre");
  pre.className = "body";
  pre.textContent = bodyText;
  wrap.appendChild(pre);
  root.appendChild(wrap);
  return root;
}

async function copyToClipboard(text, btn) {
  const label = btn.querySelector(".copy-label");
  const setState = (cls, text) => {
    btn.classList.remove("copy-ok", "copy-failed");
    if (cls) btn.classList.add(cls);
    if (label) label.textContent = text;
  };
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.setAttribute("readonly", "");
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand("copy");
      document.body.removeChild(ta);
    } catch {
      ok = false;
    }
  }
  setState(ok ? "copy-ok" : "copy-failed", ok ? "Copied" : "Failed");
  setTimeout(() => setState(null, "Copy"), 1500);
}

function prettify(text, contentType) {
  if (!text) return "";
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("json")) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

function section(title, child) {
  const s = document.createElement("div");
  s.className = "detail-section";
  const h = document.createElement("h3");
  h.textContent = title;
  s.appendChild(h);
  s.appendChild(child);
  return s;
}

function kv(entries) {
  const root = document.createElement("div");
  root.className = "kv";
  if (entries.length === 0) {
    root.textContent = "—";
    return root;
  }
  for (const [k, v] of entries) {
    const kEl = document.createElement("span");
    kEl.className = "k";
    kEl.textContent = k;
    const vEl = document.createElement("span");
    vEl.textContent = String(v);
    root.appendChild(kEl);
    root.appendChild(vEl);
  }
  return root;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

els.refresh.addEventListener("click", refresh);
els.clear.addEventListener("click", clear);
chrome.devtools.network.onNavigated.addListener(() => refresh());

refresh();

// Auto-refresh — server action 후 page 머무를 때 panel 이 stale 해지는 것 방지.
// state.selectedId 와 state.detailTab 은 refresh() 가 건드리지 않아 사용자가 보던
// 상세 영역은 유지된다.
setInterval(refresh, AUTO_REFRESH_INTERVAL_MS);
