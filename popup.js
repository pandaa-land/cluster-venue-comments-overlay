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

const inputs = {
  width: document.getElementById("width"),
  height: document.getElementById("height"),
  intervalSec: document.getElementById("intervalSec"),
  backgroundColor: document.getElementById("backgroundColor"),
  backdropColor: document.getElementById("backdropColor"),
  textColor: document.getElementById("textColor"),
  authorColor: document.getElementById("authorColor"),
  backdropVisible: document.getElementById("backdropVisible"),
  shadowVisible: document.getElementById("shadowVisible")
};
const colorPickers = {
  backgroundColor: document.getElementById("backgroundColorPicker"),
  backdropColor: document.getElementById("backdropColorPicker"),
  textColor: document.getElementById("textColorPicker"),
  authorColor: document.getElementById("authorColorPicker")
};
const alphaSliders = {
  backgroundColor: document.getElementById("backgroundColorAlpha"),
  backdropColor: document.getElementById("backdropColorAlpha"),
  textColor: document.getElementById("textColorAlpha"),
  authorColor: document.getElementById("authorColorAlpha")
};
const alphaInputs = {
  backgroundColor: document.getElementById("backgroundColorAlphaValue"),
  backdropColor: document.getElementById("backdropColorAlphaValue"),
  textColor: document.getElementById("textColorAlphaValue"),
  authorColor: document.getElementById("authorColorAlphaValue")
};
const statusText = document.getElementById("status");
const textColorWarning = document.getElementById("textColorWarning");
let isLoading = true;
let saveTimerId;

load();

document.getElementById("toggle").addEventListener("click", () => sendToActiveTab("cluster-comments-toggle"));
for (const name of ["width", "height", "intervalSec"]) {
  inputs[name].addEventListener("input", scheduleSave);
}
for (const name of ["backdropVisible", "shadowVisible"]) {
  inputs[name].addEventListener("change", scheduleSave);
}
for (const [name, picker] of Object.entries(colorPickers)) {
  picker.addEventListener("input", () => {
    inputs[name].value = normalizeColor(picker.value);
    updateTextColorWarning();
    scheduleSave();
  });
  inputs[name].addEventListener("input", () => {
    const rawColor = inputs[name].value;
    const color = normalizeColor(rawColor);
    if (!color) return;
    const parsedColor = colorToRgb(rawColor);
    const alpha = parsedColor?.a ?? clampAlpha(Number(alphaInputs[name].value));
    inputs[name].value = colorToHex(color);
    picker.value = colorToHex(color);
    alphaSliders[name].value = String(alpha);
    alphaInputs[name].value = String(alpha);
    updateTextColorWarning();
    scheduleSave();
  });
  alphaSliders[name].addEventListener("input", () => {
    setColorAlpha(name, alphaSliders[name].value);
    updateTextColorWarning();
    scheduleSave();
  });
  alphaInputs[name].addEventListener("input", () => {
    setColorAlpha(name, alphaInputs[name].value);
    updateTextColorWarning();
    scheduleSave();
  });
}

async function load() {
  const value = normalizeSettings(await storageGet());
  inputs.width.value = value.width;
  inputs.height.value = value.height;
  inputs.intervalSec.value = value.intervalSec;
  syncColorControls("backgroundColor", getSettingColor(value, "backgroundColor"));
  syncColorControls("backdropColor", getSettingColor(value, "backdropColor"));
  syncColorControls("textColor", getSettingColor(value, "textColor"));
  syncColorControls("authorColor", getSettingColor(value, "authorColor"));
  inputs.backdropVisible.checked = Boolean(value.backdropVisible);
  inputs.shadowVisible.checked = Boolean(value.shadowVisible);
  updateTextColorWarning();
  isLoading = false;
}

function scheduleSave() {
  if (isLoading) return;
  window.clearTimeout(saveTimerId);
  saveTimerId = window.setTimeout(save, 250);
}

async function save() {
  const backgroundColor = validateColorInput(inputs.backgroundColor);
  if (!backgroundColor) return;
  const backdropColor = validateColorInput(inputs.backdropColor);
  if (!backdropColor) return;
  const textColor = validateColorInput(inputs.textColor);
  if (!textColor) return;
  const authorColor = validateColorInput(inputs.authorColor);
  if (!authorColor) return;

  const previousValue = normalizeSettings(await storageGet());
  const value = {
    ...previousValue,
    width: clamp("width", Number(inputs.width.value)),
    height: clamp("height", Number(inputs.height.value)),
    intervalSec: clamp("intervalSec", Number(inputs.intervalSec.value)),
    backgroundColor: composeColor(backgroundColor, Number(alphaInputs.backgroundColor.value)),
    backdropColor: composeColor(backdropColor, Number(alphaInputs.backdropColor.value)),
    textColor: composeColor(textColor, Number(alphaInputs.textColor.value)),
    authorColor: composeColor(authorColor, Number(alphaInputs.authorColor.value)),
    backdropVisible: inputs.backdropVisible.checked,
    shadowVisible: inputs.shadowVisible.checked
  };
  await storageSet(value);
  setStatus("自動保存しました");
}

function validateColorInput(input) {
  const color = normalizeColor(input.value);
  if (!color) {
    input.setCustomValidity("#ffffff の形式で入力してください");
    setStatus("色の形式を確認してください");
    return;
  }
  input.setCustomValidity("");
  return color;
}

async function sendToActiveTab(type) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("対象タブがありません");
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type });
    setStatus(type.endsWith("refresh") ? "更新しました" : "切り替えました");
  } catch {
    setStatus("cluster のイベントページで使えます");
  }
}

function clamp(name, value) {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS[name];
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

function getSettingColor(settings, name) {
  const legacyValue = name === "backgroundColor" ? settings.backgroundRgb : "";
  const fallbackValue = name === "backdropColor" ? settings.backgroundColor : DEFAULT_SETTINGS[name];
  return normalizeColor(settings[name]) || normalizeColor(legacyValue) || normalizeColor(fallbackValue) || DEFAULT_SETTINGS[name];
}

function syncColorPickers() {
  for (const [name, picker] of Object.entries(colorPickers)) {
    picker.value = colorToHex(inputs[name].value);
    syncAlphaControls(name);
  }
}

function syncColorControls(name, value) {
  const color = normalizeColor(value);
  inputs[name].value = colorToHex(color);
  colorPickers[name].value = colorToHex(color);
  const alpha = getColorAlpha(color);
  alphaSliders[name].value = String(alpha);
  alphaInputs[name].value = String(alpha);
}

function syncAlphaControls(name) {
  const alpha = getColorAlpha(inputs[name].value);
  alphaSliders[name].value = String(alpha);
  alphaInputs[name].value = String(alpha);
}

function setColorAlpha(name, value) {
  const alpha = clampAlpha(Number(value));
  inputs[name].value = colorToHex(inputs[name].value);
  colorPickers[name].value = colorToHex(inputs[name].value);
  alphaSliders[name].value = String(alpha);
  alphaInputs[name].value = String(alpha);
}

function updateTextColorWarning() {
  const textColor = normalizeColor(inputs.textColor.value);
  const backgroundColor = normalizeColor(inputs.backgroundColor.value);
  if (!textColorWarning || !textColor || !backgroundColor) return;
  const readableTextColor = getReadableTextColor(textColor, backgroundColor);
  textColorWarning.hidden = normalizeColor(textColor) === normalizeColor(readableTextColor);
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

function setStatus(message) {
  statusText.textContent = message;
  window.setTimeout(() => {
    if (statusText.textContent === message) statusText.textContent = "";
  }, 2500);
}

function storageGet() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULT_SETTINGS }, (result) => {
      resolve(result[STORAGE_KEY] || DEFAULT_SETTINGS);
    });
  });
}

function storageSet(value) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: value }, resolve);
  });
}
