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

async function fetchSession(apiPath, requestId) {
  const expr = `(async () => {
    const url = ${JSON.stringify(apiPath)} + '?id=' + encodeURIComponent(${JSON.stringify(requestId)});
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('status ' + r.status);
    return r.json();
  })()`;
  return evalInPage(expr);
}

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
    const session = await fetchSession(marker.apiPath, marker.requestId);
    state.entries = session.entries ?? [];
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
  const pre = document.createElement("pre");
  pre.className = "body";
  pre.textContent = prettify(capture.data, capture.contentType);
  root.appendChild(pre);
  return root;
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
