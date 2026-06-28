(() => {
  const API_BASE_URL = "https://api.cluster.mu";
  const STORAGE_KEY = "clusterVenueComments";
  const DEFAULT_SETTINGS = {
    width: 360,
    height: 520,
    intervalSec: 15,
    backgroundColor: "rgb(18, 22, 31)",
    backdropColor: "rgb(18, 22, 31)",
    textColor: "#ffffff",
    authorColor: "#9ee6ff",
    settingsVisible: true,
    backdropVisible: false,
    shadowVisible: true,
    visible: true,
    maxItems: 30
  };
  const CLUSTER_HEADERS = {
    "Content-Type": "application/json",
    "X-Cluster-App-Version": "3.88.2606171822",
    "X-Cluster-Build-Version": "2606261151",
    "X-Cluster-Platform": "Web",
    "X-Cluster-Device": "Web",
    "Accept-Language": navigator.language || "ja"
  };

  let settings = { ...DEFAULT_SETTINGS };
  let overlay;
  let backdropLayer;
  let list;
  let statusText;
  let timerId;
  let lastEventId = "";
  let lastCommentIds = new Set();

  init().catch((error) => {
    createOverlay();
    setStatus(`初期化失敗: ${error.message || error}`);
    console.error("[cluster-comments-overlay] init failed", error);
  });

  async function init() {
    createOverlay();
    settings = normalizeSettings(await readSettings());
    applySettings();
    await refreshComments();
    scheduleRefresh();
    watchSpaNavigation();
    bindStorageUpdates();
    bindPopupMessages();
  }

  function createOverlay() {
    if (overlay) return;

    overlay = document.createElement("aside");
    overlay.id = "cluster-comments-overlay";
    overlay.innerHTML = `
      <div class="cco-header">
        <strong>会場のコメント</strong>
        <div class="cco-actions">
          <button type="button" data-action="settings" title="設定を表示/非表示">⚙</button>
          <button type="button" data-action="refresh" title="再読み込み">↻</button>
          <button type="button" data-action="toggle" title="表示/非表示">−</button>
        </div>
      </div>
      <form class="cco-settings">
        <label>幅 <input name="width" type="number" min="240" max="900" step="10"></label>
        <label>高さ <input name="height" type="number" min="180" max="1000" step="10"></label>
        <label>秒 <input name="intervalSec" type="number" min="3" max="300" step="1"></label>
        <div class="cco-color-grid">
          <label class="cco-color-field">背景色 <span class="cco-color-controls"><input name="backgroundColor" type="text" inputmode="text" placeholder="#12161f"><input type="color" data-color-picker="backgroundColor" title="背景色を選択"><input type="range" min="0" max="1" step="0.01" data-alpha-slider="backgroundColor" title="背景色の透明度"><input type="number" min="0" max="1" step="0.01" data-alpha-input="backgroundColor" title="背景色の透明度"></span></label>
          <label class="cco-color-field">背景隠し色 <span class="cco-color-controls"><input name="backdropColor" type="text" inputmode="text" placeholder="#12161f"><input type="color" data-color-picker="backdropColor" title="背景隠し色を選択"><input type="range" min="0" max="1" step="0.01" data-alpha-slider="backdropColor" title="背景隠し色の透明度"><input type="number" min="0" max="1" step="0.01" data-alpha-input="backdropColor" title="背景隠し色の透明度"></span></label>
          <label class="cco-color-field"><span class="cco-label-row">文字色 <span class="cco-warning" data-warning="textColor" title="背景色と近いため、読みやすい文字色に自動補正しています" hidden>⚠ 補正中</span></span><span class="cco-color-controls"><input name="textColor" type="text" inputmode="text" placeholder="#ffffff"><input type="color" data-color-picker="textColor" title="文字色を選択"><input type="range" min="0" max="1" step="0.01" data-alpha-slider="textColor" title="文字色の透明度"><input type="number" min="0" max="1" step="0.01" data-alpha-input="textColor" title="文字色の透明度"></span></label>
          <label class="cco-color-field">投稿者名色 <span class="cco-color-controls"><input name="authorColor" type="text" inputmode="text" placeholder="#9ee6ff"><input type="color" data-color-picker="authorColor" title="投稿者名色を選択"><input type="range" min="0" max="1" step="0.01" data-alpha-slider="authorColor" title="投稿者名色の透明度"><input type="number" min="0" max="1" step="0.01" data-alpha-input="authorColor" title="投稿者名色の透明度"></span></label>
        </div>
        <label class="cco-check-field"><input name="backdropVisible" type="checkbox"> 背景を隠す</label>
        <label class="cco-check-field"><input name="shadowVisible" type="checkbox"> 影を表示</label>
      </form>
      <div class="cco-status" aria-live="polite"></div>
      <div class="cco-list"></div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #cluster-comments-backdrop {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: block;
        background: rgb(18, 22, 31);
        pointer-events: none;
      }
      #cluster-comments-backdrop[hidden] { display: none; }
      #cluster-comments-overlay {
        position: fixed;
        left: 16px;
        bottom: 16px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        overflow: hidden;
        color: var(--cco-text-color, #ffffff);
        background: rgb(18, 22, 31);
        border: 1px solid var(--cco-border-color, rgba(255, 255, 255, 0.18));
        border-radius: 8px;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(10px);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #cluster-comments-overlay[hidden] { display: none; }
      #cluster-comments-overlay.is-collapsed {
        height: auto !important;
      }
      #cluster-comments-overlay.is-collapsed .cco-settings,
      #cluster-comments-overlay.is-collapsed .cco-status,
      #cluster-comments-overlay.is-collapsed .cco-list {
        display: none;
      }
      #cluster-comments-overlay.is-settings-hidden .cco-settings {
        display: none;
      }
      .cco-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 12px;
        color: var(--cco-chrome-color, #ffffff);
        background: var(--cco-header-bg, rgba(255, 255, 255, 0.08));
        cursor: move;
        user-select: none;
      }
      .cco-header strong {
        overflow: hidden;
        font-size: 14px;
        line-height: 1.2;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cco-actions {
        display: flex;
        flex: 0 0 auto;
        gap: 6px;
      }
      .cco-actions button {
        width: 28px;
        height: 28px;
        border: 1px solid var(--cco-control-border, rgba(255, 255, 255, 0.22));
        border-radius: 6px;
        color: var(--cco-chrome-color, #ffffff);
        background: var(--cco-control-bg, rgba(255, 255, 255, 0.1));
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
      }
      .cco-actions button:hover {
        background: var(--cco-control-hover-bg, rgba(255, 255, 255, 0.18));
      }
      .cco-settings {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--cco-divider-color, rgba(255, 255, 255, 0.12));
      }
      .cco-settings label {
        display: grid;
        gap: 4px;
        min-width: 0;
        color: var(--cco-chrome-color, #ffffff);
        font-size: 11px;
      }
      .cco-label-row {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      .cco-warning {
        color: #d97706;
        font-size: 10px;
        font-weight: 800;
        white-space: nowrap;
      }
      .cco-warning[hidden] {
        display: none;
      }
      .cco-settings .cco-color-grid {
        display: grid;
        grid-column: 1 / -1;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .cco-settings .cco-color-controls {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 36px 52px;
        gap: 6px;
        width: 100%;
      }
      .cco-settings .cco-check-field {
        display: flex;
        grid-column: 1 / -1;
        align-items: center;
        gap: 6px;
      }
      .cco-settings input {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        padding: 6px;
        border: 1px solid var(--cco-control-border, rgba(255, 255, 255, 0.2));
        border-radius: 6px;
        color: var(--cco-input-color, #ffffff);
        background: var(--cco-input-bg, rgba(0, 0, 0, 0.22));
        font: inherit;
      }
      .cco-settings input[type="checkbox"] {
        width: auto;
        margin: 0;
      }
      .cco-settings .cco-color-controls input[name] {
        grid-column: 1 / 3;
      }
      .cco-settings input[type="color"] {
        grid-column: 3;
        width: 36px;
        min-width: 100%;
        height: 31px;
        padding: 2px;
        cursor: pointer;
      }
      .cco-settings input[data-alpha-slider] {
        grid-column: 1 / 3;
        padding-right: 0;
        padding-left: 0;
      }
      .cco-settings input[data-alpha-input] {
        grid-column: 3;
        padding-right: 4px;
        padding-left: 4px;
      }
      @media (max-width: 420px) {
        .cco-settings .cco-color-grid {
          grid-template-columns: 1fr;
        }
      }
      .cco-status {
        flex: 0 0 auto;
        min-height: 18px;
        padding: 8px 12px 0;
        color: var(--cco-chrome-color, #ffffff);
        opacity: 0.62;
        font-size: 11px;
      }
      .cco-list {
        flex: 1 1 auto;
        overflow: auto;
        padding: 8px 12px 12px;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .cco-list::-webkit-scrollbar {
        display: none;
      }
      .cco-comment {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr);
        gap: 9px;
        padding: 10px 0;
        border-bottom: 1px solid var(--cco-divider-color, rgba(255, 255, 255, 0.1));
      }
      .cco-comment.is-new {
        animation: cco-highlight 1.8s ease-out;
      }
      .cco-avatar {
        width: 34px;
        height: 34px;
        margin-top: 1px;
        overflow: hidden;
        border: 1px solid var(--cco-border-color, rgba(255, 255, 255, 0.18));
        border-radius: 50%;
        color: #10202a;
        background: #9ee6ff;
        font-size: 13px;
        font-weight: 800;
        line-height: 34px;
        text-align: center;
        object-fit: cover;
      }
      .cco-content {
        display: grid;
        gap: 4px;
        min-width: 0;
      }
      .cco-meta {
        display: flex;
        align-items: baseline;
        gap: 8px;
        min-width: 0;
      }
      .cco-name {
        overflow: hidden;
        color: var(--cco-author-color, #9ee6ff);
        font-size: 12px;
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cco-time {
        flex: 0 0 auto;
        color: var(--cco-text-color, #ffffff);
        opacity: 0.54;
        font-size: 11px;
      }
      .cco-body {
        color: var(--cco-text-color, #ffffff);
        font-size: 13px;
        line-height: 1.45;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
      }
      @keyframes cco-highlight {
        0% { background: rgba(84, 214, 255, 0.22); }
        100% { background: transparent; }
      }
    `;

    backdropLayer = document.createElement("div");
    backdropLayer.id = "cluster-comments-backdrop";
    backdropLayer.hidden = true;

    document.documentElement.append(style, backdropLayer, overlay);
    list = overlay.querySelector(".cco-list");
    statusText = overlay.querySelector(".cco-status");
    overlay.querySelector("[data-action='settings']").addEventListener("click", async () => {
      settings = { ...settings, settingsVisible: overlay.classList.contains("is-settings-hidden") };
      applySettings();
      await saveSettings(settings);
    });
    overlay.querySelector("[data-action='refresh']").addEventListener("click", refreshComments);
    overlay.querySelector("[data-action='toggle']").addEventListener("click", () => {
      overlay.classList.toggle("is-collapsed");
    });
    overlay.querySelector(".cco-settings").addEventListener("input", onOverlaySettingsInput);
    enableDragging(overlay, overlay.querySelector(".cco-header"));
  }

  async function onOverlaySettingsInput(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const pickerName = input.dataset.colorPicker;
    if (pickerName && isColorSetting(pickerName)) {
      settings = { ...settings, [pickerName]: composeColor(input.value, getColorAlpha(getSettingColor(pickerName))) };
      applySettings();
      await saveSettings(settings);
      return;
    }
    const alphaName = input.dataset.alphaSlider || input.dataset.alphaInput;
    if (alphaName && isColorSetting(alphaName)) {
      const alpha = clampAlpha(Number(input.value));
      settings = { ...settings, [alphaName]: composeColor(getSettingColor(alphaName), alpha) };
      applySettings();
      await saveSettings(settings);
      return;
    }
    if (isColorSetting(input.name)) {
      const color = normalizeColor(input.value);
      if (!color) {
        input.setCustomValidity("#ffffff の形式で入力してください");
        return;
      }
      input.setCustomValidity("");
      settings = { ...settings, [input.name]: composeColor(color, getColorAlpha(getSettingColor(input.name))) };
      applySettings();
      await saveSettings(settings);
      return;
    }
    if (input.type === "checkbox") {
      settings = { ...settings, [input.name]: input.checked };
      applySettings();
      await saveSettings(settings);
      return;
    }
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    settings = {
      ...settings,
      [input.name]: clampSetting(input.name, value)
    };
    applySettings();
    await saveSettings(settings);
    if (input.name === "intervalSec") scheduleRefresh();
  }

  function applySettings() {
    overlay.hidden = !settings.visible;
    overlay.classList.toggle("is-settings-hidden", !settings.settingsVisible);
    overlay.style.width = `${settings.width}px`;
    overlay.style.height = `${settings.height}px`;
    const backgroundColor = getSettingColor("backgroundColor");
    const rawTextColor = getSettingColor("textColor");
    const readableTextColor = getReadableTextColor(rawTextColor, backgroundColor);
    overlay.style.backgroundColor = backgroundColor;
    overlay.style.boxShadow = settings.shadowVisible ? "0 18px 48px rgba(0, 0, 0, 0.35)" : "none";
    backdropLayer.hidden = !settings.visible || !settings.backdropVisible;
    backdropLayer.style.backgroundColor = getSettingColor("backdropColor");
    overlay.style.setProperty("--cco-text-color", readableTextColor);
    overlay.style.setProperty("--cco-author-color", getSettingColor("authorColor"));
    const textWarning = overlay.querySelector("[data-warning='textColor']");
    if (textWarning) textWarning.hidden = normalizeColor(rawTextColor) === normalizeColor(readableTextColor);
    applyContrastVars(backgroundColor);
    for (const input of overlay.querySelectorAll(".cco-settings input")) {
      const pickerName = input.dataset.colorPicker;
      if (pickerName && isColorSetting(pickerName)) {
        input.value = colorToHex(getSettingColor(pickerName));
        continue;
      }
      const alphaName = input.dataset.alphaSlider || input.dataset.alphaInput;
      if (alphaName && isColorSetting(alphaName)) {
        input.value = String(getColorAlpha(getSettingColor(alphaName)));
        continue;
      }
      if (input.type === "checkbox") {
        input.checked = Boolean(settings[input.name]);
        continue;
      }
      input.value = isColorSetting(input.name)
        ? colorToHex(getSettingColor(input.name))
        : String(settings[input.name]);
    }
  }

  async function refreshComments() {
    const eventId = getEventId();
    if (!eventId) {
      setStatus("イベント ID が見つかりません");
      renderComments([]);
      return;
    }
    if (eventId !== lastEventId) {
      lastEventId = eventId;
      lastCommentIds = new Set();
      renderComments([]);
    }

    try {
      const comments = await fetchComments(eventId);
      renderComments(comments);
      setStatus(`${formatClock(new Date())} 更新 / ${comments.length}件`);
    } catch (error) {
      setStatus(`読み込み失敗: ${error.message || error}`);
    }
  }

  async function fetchComments(eventId) {
    const token = await readFirebaseAccessToken();
    const headers = token
      ? { ...CLUSTER_HEADERS, Authorization: `Bearer ${token}` }
      : CLUSTER_HEADERS;
    const response = await fetch(`${API_BASE_URL}/v1/events/${encodeURIComponent(eventId)}/comments`, {
      method: "GET",
      headers,
      credentials: "omit",
      cache: "no-store"
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`${response.status}${body ? ` ${body.slice(0, 120)}` : ""}`);
    }
    const data = await response.json();
    return Array.isArray(data.comments) ? data.comments.slice(0, settings.maxItems) : [];
  }

  function renderComments(items) {
    const nextIds = new Set(items.map((item) => String(item.comment?.id || "")));
    const fragment = document.createDocumentFragment();

    for (const item of items) {
      const id = String(item.comment?.id || "");
      const article = document.createElement("article");
      article.className = `cco-comment${id && !lastCommentIds.has(id) ? " is-new" : ""}`;
      const displayName = item.user?.displayName || item.user?.username || "unknown";
      article.innerHTML = `
        <div class="cco-avatar" aria-hidden="true"></div>
        <div class="cco-content">
          <div class="cco-meta">
            <span class="cco-name"></span>
            <time class="cco-time"></time>
          </div>
          <div class="cco-body"></div>
        </div>
      `;
      renderAvatar(article.querySelector(".cco-avatar"), item.user?.photoUrl, displayName);
      article.querySelector(".cco-name").textContent = displayName;
      article.querySelector(".cco-time").textContent = formatCommentTime(item.comment?.createdAt);
      article.querySelector(".cco-body").textContent = item.comment?.body || "";
      fragment.append(article);
    }

    list.replaceChildren(fragment);
    lastCommentIds = nextIds;
  }

  function renderAvatar(container, photoUrl, displayName) {
    container.textContent = getInitial(displayName);
    if (!photoUrl) return;

    const image = document.createElement("img");
    image.className = "cco-avatar";
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.src = photoUrl;
    image.addEventListener("error", () => {
      image.replaceWith(container);
    });
    container.replaceWith(image);
  }

  function setStatus(message) {
    if (statusText) statusText.textContent = message;
  }

  function scheduleRefresh() {
    window.clearInterval(timerId);
    timerId = window.setInterval(refreshComments, Math.max(3, settings.intervalSec) * 1000);
  }

  function watchSpaNavigation() {
    window.setInterval(() => {
      const eventId = getEventId();
      if (eventId && eventId !== lastEventId) refreshComments();
    }, 1000);
  }

  function bindStorageUpdates() {
    if (!globalThis.chrome?.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync" || !changes[STORAGE_KEY]) return;
      settings = normalizeSettings(changes[STORAGE_KEY].newValue);
      applySettings();
      scheduleRefresh();
    });
  }

  function bindPopupMessages() {
    if (!globalThis.chrome?.runtime?.onMessage) return;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "cluster-comments-refresh") {
        refreshComments().then(() => sendResponse({ ok: true }));
        return true;
      }
      if (message?.type === "cluster-comments-toggle") {
        settings = { ...settings, visible: !settings.visible };
        saveSettings(settings).then(() => {
          applySettings();
          sendResponse({ ok: true, visible: settings.visible });
        });
        return true;
      }
      return false;
    });
  }

  function getEventId() {
    const match = location.pathname.match(/^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?e\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  async function readFirebaseAccessToken() {
    try {
      const db = await openIndexedDb("firebaseLocalStorageDb");
      const values = await readAllFromStore(db, "firebaseLocalStorage");
      const auth = values
        .map((entry) => entry?.value || entry)
        .find((value) => value?.stsTokenManager?.accessToken);
      return auth?.stsTokenManager?.accessToken || "";
    } catch {
      return "";
    }
  }

  function openIndexedDb(name) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function readAllFromStore(db, storeName) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
    });
  }

  function readSettings() {
    return new Promise((resolve) => {
      if (!globalThis.chrome?.storage?.sync) {
        resolve(DEFAULT_SETTINGS);
        return;
      }
      try {
        chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULT_SETTINGS }, (result) => {
          if (chrome.runtime.lastError) {
            console.warn("[cluster-comments-overlay] storage read failed", chrome.runtime.lastError);
            resolve(DEFAULT_SETTINGS);
            return;
          }
          resolve(result[STORAGE_KEY] || DEFAULT_SETTINGS);
        });
      } catch (error) {
        console.warn("[cluster-comments-overlay] storage read failed", error);
        resolve(DEFAULT_SETTINGS);
      }
    });
  }

  function saveSettings(nextSettings) {
    return new Promise((resolve) => {
      if (!globalThis.chrome?.storage?.sync) {
        resolve();
        return;
      }
      try {
        chrome.storage.sync.set({ [STORAGE_KEY]: nextSettings }, () => {
          if (chrome.runtime.lastError) {
            console.warn("[cluster-comments-overlay] storage save failed", chrome.runtime.lastError);
          }
          resolve();
        });
      } catch (error) {
        console.warn("[cluster-comments-overlay] storage save failed", error);
        resolve();
      }
    });
  }

  function clampSetting(name, value) {
    if (name === "width") return Math.min(900, Math.max(240, Math.round(value)));
    if (name === "height") return Math.min(1000, Math.max(180, Math.round(value)));
    if (name === "intervalSec") return Math.min(300, Math.max(3, Math.round(value)));
    return value;
  }

  function normalizeSettings(value) {
    const next = { ...DEFAULT_SETTINGS, ...(value || {}) };
    if (value?.backgroundRgb && !value.backgroundColor) {
      next.backgroundColor = value.backgroundRgb;
    }
    if (!value?.backdropColor) {
      next.backdropColor = next.backgroundColor;
    }
    return next;
  }

  function getSettingColor(name) {
    const legacyValue = name === "backgroundColor" ? settings.backgroundRgb : "";
    const fallbackValue = name === "backdropColor" ? settings.backgroundColor : DEFAULT_SETTINGS[name];
    return normalizeColor(settings[name]) || normalizeColor(legacyValue) || normalizeColor(fallbackValue) || DEFAULT_SETTINGS[name];
  }

  function isColorSetting(name) {
    return name === "backgroundColor" || name === "backdropColor" || name === "textColor" || name === "authorColor";
  }

  function applyContrastVars(backgroundColor) {
    const rgb = colorToRgb(backgroundColor) || colorToRgb(DEFAULT_SETTINGS.backgroundColor);
    const isLight = getRelativeLuminance(rgb) > 0.62;
    const vars = isLight
      ? {
          "--cco-chrome-color": "#17202a",
          "--cco-border-color": "rgba(23, 32, 42, 0.28)",
          "--cco-divider-color": "rgba(23, 32, 42, 0.16)",
          "--cco-header-bg": "rgba(23, 32, 42, 0.08)",
          "--cco-control-bg": "rgba(23, 32, 42, 0.08)",
          "--cco-control-hover-bg": "rgba(23, 32, 42, 0.14)",
          "--cco-control-border": "rgba(23, 32, 42, 0.26)",
          "--cco-input-bg": "rgba(255, 255, 255, 0.78)",
          "--cco-input-color": "#17202a"
        }
      : {
          "--cco-chrome-color": "#ffffff",
          "--cco-border-color": "rgba(255, 255, 255, 0.18)",
          "--cco-divider-color": "rgba(255, 255, 255, 0.12)",
          "--cco-header-bg": "rgba(255, 255, 255, 0.08)",
          "--cco-control-bg": "rgba(255, 255, 255, 0.1)",
          "--cco-control-hover-bg": "rgba(255, 255, 255, 0.18)",
          "--cco-control-border": "rgba(255, 255, 255, 0.22)",
          "--cco-input-bg": "rgba(0, 0, 0, 0.22)",
          "--cco-input-color": "#ffffff"
        };
    for (const [name, value] of Object.entries(vars)) {
      overlay.style.setProperty(name, value);
    }
  }

  function getReadableTextColor(textColor, backgroundColor) {
    const textRgb = colorToRgb(textColor);
    const backgroundRgb = colorToRgb(backgroundColor);
    if (!textRgb || !backgroundRgb) return textColor;
    if (getContrastRatio(textRgb, backgroundRgb) >= 4.5) return textColor;

    const dark = { r: 23, g: 32, b: 42 };
    const light = { r: 255, g: 255, b: 255 };
    return getContrastRatio(dark, backgroundRgb) >= getContrastRatio(light, backgroundRgb)
      ? "#17202a"
      : "#ffffff";
  }

  function normalizeColor(value) {
    const color = String(value || "").trim();
    const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
    if (hexMatch) return `#${hexMatch[1].toLowerCase()}`;

    const rgbMatch = color.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
    if (rgbMatch) {
      const parts = rgbMatch.slice(1).map(Number);
      if (parts.some((part) => part < 0 || part > 255)) return "";
      return rgbToHex({ r: parts[0], g: parts[1], b: parts[2] });
    }

    const rgbaMatch = color.match(/^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*((?:0|1)(?:\.\d+)?|\.\d+)\s*\)$/i);
    if (!rgbaMatch) return "";
    const [r, g, b] = rgbaMatch.slice(1, 4).map(Number);
    const alpha = Number(rgbaMatch[4]);
    if ([r, g, b].some((part) => part < 0 || part > 255) || alpha < 0 || alpha > 1) return "";
    if (alpha === 1) return rgbToHex({ r, g, b });
    return `rgba(${r}, ${g}, ${b}, ${formatAlpha(alpha)})`;
  }

  function colorToRgb(value) {
    const color = normalizeColor(value);
    const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
    if (hexMatch) {
      const hex = hexMatch[1];
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16)
      };
    }

    const rgbaMatch = color.match(/^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*((?:0|1)(?:\.\d+)?|\.\d+)\s*\)$/i);
    if (rgbaMatch) {
      return {
        r: Number(rgbaMatch[1]),
        g: Number(rgbaMatch[2]),
        b: Number(rgbaMatch[3]),
        a: Number(rgbaMatch[4])
      };
    }

    const rgbMatch = color.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
    if (!rgbMatch) return null;
    return { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]), a: 1 };
  }

  function colorToHex(value) {
    const rgb = colorToRgb(value);
    if (!rgb) return "#000000";
    return rgbToHex(rgb);
  }

  function getColorAlpha(value) {
    const rgb = colorToRgb(value);
    return rgb?.a ?? 1;
  }

  function composeColor(value, alpha) {
    const rgb = colorToRgb(value);
    if (!rgb) return normalizeColor(value) || "#000000";
    const nextAlpha = clampAlpha(alpha);
    if (nextAlpha === 1) return rgbToHex(rgb);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${formatAlpha(nextAlpha)})`;
  }

  function clampAlpha(value) {
    if (!Number.isFinite(value)) return 1;
    return Math.min(1, Math.max(0, Number(value.toFixed(2))));
  }

  function rgbToHex({ r, g, b }) {
    const toHex = (channel) => channel.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function formatAlpha(value) {
    return String(Number(value.toFixed(3))).replace(/0+$/, "").replace(/\.$/, "");
  }

  function getRelativeLuminance({ r, g, b }) {
    const [red, green, blue] = [r, g, b].map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }

  function getContrastRatio(first, second) {
    const a = getRelativeLuminance(first);
    const b = getRelativeLuminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  function formatCommentTime(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? formatClock(date) : "";
  }

  function getInitial(displayName) {
    return String(displayName || "?").trim().slice(0, 1).toUpperCase() || "?";
  }

  function formatClock(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function enableDragging(node, handle) {
    let dragging = null;
    handle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      const rect = node.getBoundingClientRect();
      dragging = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top
      };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (!dragging || event.pointerId !== dragging.pointerId) return;
      const left = dragging.left + event.clientX - dragging.startX;
      const top = dragging.top + event.clientY - dragging.startY;
      node.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, left))}px`;
      node.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, top))}px`;
      node.style.right = "auto";
      node.style.bottom = "auto";
    });
    handle.addEventListener("pointerup", () => {
      dragging = null;
    });
  }
})();
