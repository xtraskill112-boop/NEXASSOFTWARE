import Anthropic from "@anthropic-ai/sdk";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { MODES, modeById, systemPrompt } from "./prompts.js";

// ---------- Settings ----------
const MODEL = "claude-opus-5-5";
const MAX_TOKENS = 64000;
const KEY_STORE = "nexas-ai:key";
const CHAT_STORE = "nexas-ai:chat:v1";
const PREFS_STORE = "nexas-ai:prefs:v1";
const MAX_IMAGE_SIDE = 1568; // larger photos are scaled down before sending
const HISTORY_CHAR_BUDGET = 200000;

const $ = (id) => document.getElementById(id);
const el = {
  thread: $("thread"), welcome: $("welcome"), scroller: $("scroller"), modes: $("modes"),
  starters: $("starters"), eyebrow: $("modeEyebrow"), blurb: $("modeBlurb"),
  connectCard: $("connectCard"), connectBtn: $("connectBtn"),
  form: $("composer"), input: $("input"), send: $("sendBtn"), stop: $("stopBtn"),
  attach: $("attachBtn"), file: $("fileInput"), preview: $("attachPreview"),
  previewImg: $("previewImg"), previewName: $("previewName"), previewRemove: $("previewRemove"),
  mic: $("micBtn"), effort: $("effort"), newChat: $("newChat"), notice: $("notice"),
  settingsBtn: $("settingsBtn"), settings: $("settings"), settingsForm: $("settingsForm"),
  apiKey: $("apiKey"), toggleKey: $("toggleKey"), rememberKey: $("rememberKey"),
  voiceLang: $("voiceLang"), settingsMsg: $("settingsMsg"), forgetKey: $("forgetKey"),
  cancelSettings: $("cancelSettings"),
};

// ---------- Storage helpers (never throw) ----------
const store = {
  get(area, key) { try { return window[area].getItem(key); } catch { return null; } },
  set(area, key, value) { try { window[area].setItem(key, value); } catch { /* storage blocked */ } },
  remove(area, key) { try { window[area].removeItem(key); } catch { /* storage blocked */ } },
};

// ---------- State ----------
// A turn: { role: "user" | "assistant", text, image?: { media_type, data, url }, photo?: boolean, note?: string }
let state = { mode: "chat", effort: "medium", turns: [] };
let prefs = { voiceLang: "en-IN" };
let apiKey = store.get("localStorage", KEY_STORE) || store.get("sessionStorage", KEY_STORE) || "";
let client = null;
let pending = null; // photo waiting to be sent: { media_type, data, url, name }
let busy = false;
let currentStream = null;

function loadState() {
  try {
    const s = JSON.parse(store.get("localStorage", CHAT_STORE) || "null");
    if (s && Array.isArray(s.turns)) {
      state.turns = s.turns
        .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.text === "string")
        .map((t) => ({ role: t.role, text: t.text, photo: !!t.photo, note: t.note || "" }));
    }
    if (s && MODES.some((m) => m.id === s.mode)) state.mode = s.mode;
    if (s && ["low", "medium", "high"].includes(s.effort)) state.effort = s.effort;
  } catch { /* start fresh */ }
  try {
    const p = JSON.parse(store.get("localStorage", PREFS_STORE) || "null");
    if (p && typeof p.voiceLang === "string") prefs.voiceLang = p.voiceLang;
  } catch { /* defaults */ }
}
function saveState() {
  // Photos stay in memory only; saved chats remember that a photo was attached.
  const turns = state.turns.slice(-80).map((t) => ({ role: t.role, text: t.text, photo: !!(t.photo || t.image), note: t.note || "" }));
  store.set("localStorage", CHAT_STORE, JSON.stringify({ mode: state.mode, effort: state.effort, turns }));
}

function getClient() {
  if (!apiKey) return null;
  if (!client) {
    // The key belongs to the person using this page and is only sent to api.anthropic.com.
    client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  }
  return client;
}

// ---------- Markdown ----------
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});
function md(text) {
  const html = marked.parse(text, { gfm: true, breaks: true, async: false });
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, "</table></div>");
}

// ---------- Icons ----------
const ICON = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>',
  speak: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
  retry: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/></svg>',
};

// ---------- Rendering ----------
const nearBottom = () => el.scroller.scrollHeight - el.scroller.scrollTop - el.scroller.clientHeight < 140;
const toBottom = () => { el.scroller.scrollTop = el.scroller.scrollHeight; };
const showNotice = (text) => { el.notice.textContent = text || ""; el.notice.hidden = !text; };

function renderModes() {
  el.modes.textContent = "";
  for (const m of MODES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = m.label;
    b.setAttribute("aria-pressed", String(m.id === state.mode));
    b.addEventListener("click", () => setMode(m.id));
    el.modes.append(b);
  }
}

function renderWelcome() {
  const m = modeById(state.mode);
  el.eyebrow.textContent = m.label;
  el.blurb.textContent = m.blurb;
  el.input.placeholder = m.placeholder;
  el.connectCard.hidden = !!apiKey;
  el.starters.textContent = "";
  for (const [tag, prompt] of m.starters) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "starter";
    const t = document.createElement("b");
    t.textContent = tag;
    const s = document.createElement("span");
    s.textContent = prompt === "PHOTO" ? "Add a product photo and I'll write the whole listing from it" : prompt;
    b.append(t, s);
    b.addEventListener("click", () => (prompt === "PHOTO" ? el.file.click() : send(prompt)));
    el.starters.append(b);
  }
  el.welcome.hidden = state.turns.length > 0;
}

function setMode(id) {
  state.mode = id;
  renderModes();
  renderWelcome();
  saveState();
  el.input.focus();
}

function userNode(turn) {
  const a = document.createElement("article");
  a.className = "msg me";
  const b = document.createElement("div");
  b.className = "bubble";
  if (turn.image) {
    const img = document.createElement("img");
    img.src = turn.image.url;
    img.alt = "Photo you attached";
    b.append(img);
  } else if (turn.photo) {
    const c = document.createElement("span");
    c.className = "photo-chip";
    c.textContent = "Photo attached";
    b.append(c);
  }
  const p = document.createElement("p");
  p.textContent = turn.text;
  b.append(p);
  a.append(b);
  return a;
}

function actButton(label, icon, onClick, extraClass) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "act" + (extraClass ? " " + extraClass : "");
  b.innerHTML = icon + "<span></span>";
  b.querySelector("span").textContent = label;
  b.addEventListener("click", () => onClick(b));
  return b;
}
const setActLabel = (btn, text) => { btn.querySelector("span").textContent = text; };

function aiNode() {
  const a = document.createElement("article");
  a.className = "msg ai";
  a.innerHTML = '<span class="mark" aria-hidden="true"></span><div class="ai-body"><div class="prose"></div><p class="note" hidden></p><div class="actions" hidden></div></div>';
  const prose = a.querySelector(".prose");
  const note = a.querySelector(".note");
  const actions = a.querySelector(".actions");
  return {
    node: a,
    thinking() {
      prose.innerHTML = '<span class="thinking"><span class="dots"><i></i><i></i><i></i></span>Thinking…</span>';
    },
    setText(text) { prose.innerHTML = text ? md(text) : ""; },
    setNote(text, isErr) {
      note.hidden = !text;
      note.textContent = text || "";
      note.classList.toggle("err", !!isErr);
    },
    setActions(turn, { retry = false, settings = false } = {}) {
      actions.textContent = "";
      if (turn && turn.text) {
        actions.append(actButton("Copy", ICON.copy, (btn) => copyText(turn.text, prose, btn)));
        if (canSpeak) {
          const sp = actButton("Listen", ICON.speak, (btn) => toggleSpeak(turn.text, btn));
          sp.setAttribute("aria-pressed", "false");
          actions.append(sp);
        }
      }
      if (settings) actions.append(actButton("Open settings", ICON.gear, () => openSettings()));
      if (retry) actions.append(actButton("Retry", ICON.retry, () => { a.remove(); ask(); }));
      actions.hidden = actions.childElementCount === 0;
    },
  };
}

function renderAll() {
  for (const n of [...el.thread.querySelectorAll(".msg")]) n.remove();
  for (const t of state.turns) {
    if (t.role === "user") {
      el.thread.append(userNode(t));
    } else {
      const ai = aiNode();
      ai.setText(t.text);
      ai.setNote(t.note, false);
      ai.setActions(t);
      el.thread.append(ai.node);
    }
  }
  renderWelcome();
  if (state.turns.length) requestAnimationFrame(toBottom);
  else el.scroller.scrollTop = 0;
}

// ---------- Copy ----------
function copyText(text, node, btn) {
  const done = () => { setActLabel(btn, "Copied"); setTimeout(() => setActLabel(btn, "Copy"), 1500); };
  const fallback = () => {
    const r = document.createRange();
    r.selectNodeContents(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    setActLabel(btn, "Selected, press Ctrl+C");
    setTimeout(() => setActLabel(btn, "Copy"), 2500);
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}

// ---------- Read aloud (browser voices) ----------
const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
let speakingBtn = null;
function toggleSpeak(text, btn) {
  const synth = window.speechSynthesis;
  if (speakingBtn === btn) {
    synth.cancel();
    return;
  }
  synth.cancel();
  if (speakingBtn) resetSpeakBtn(speakingBtn);
  const plain = text.replace(/```[\s\S]*?```/g, " ").replace(/[#*_>`|]/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return;
  const u = new SpeechSynthesisUtterance(plain);
  u.lang = /[ऀ-ॿ]/.test(plain) ? "hi-IN" : "en-IN";
  u.onend = u.onerror = () => { if (speakingBtn === btn) { resetSpeakBtn(btn); speakingBtn = null; } };
  speakingBtn = btn;
  btn.setAttribute("aria-pressed", "true");
  setActLabel(btn, "Stop");
  synth.speak(u);
}
function resetSpeakBtn(btn) { btn.setAttribute("aria-pressed", "false"); setActLabel(btn, "Listen"); }

// ---------- Talking to Claude ----------
function buildMessages() {
  // Earlier answers are replayed as plain text, so changing tools mid-chat is always safe.
  let msgs = state.turns
    .filter((t) => t.text && t.text.trim())
    .map((t) => {
      if (t.role === "assistant") return { role: "assistant", content: t.text };
      const text = t.photo && !t.image ? `${t.text}\n\n(I attached a product photo earlier; it is no longer available.)` : t.text;
      if (t.image) {
        return {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: t.image.media_type, data: t.image.data } },
            { type: "text", text },
          ],
        };
      }
      return { role: "user", content: text };
    });
  // Keep long chats within budget by dropping the oldest turns.
  const size = (m) => (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length);
  let total = msgs.reduce((n, m) => n + size(m), 0);
  while (total > HISTORY_CHAR_BUDGET && msgs.length > 1) total -= size(msgs.shift());
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs;
}

function errorCopy(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return { text: "Your API key wasn't accepted. Open Settings and paste the key again.", settings: true };
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return { text: "This API key isn't allowed to use Claude Opus 5.5. Check the key's workspace in the Claude Console.", settings: true };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { text: "Too many requests right now. Wait a minute, then press Retry.", retry: true };
  }
  if (err instanceof Anthropic.BadRequestError) {
    const detail = err.error?.error?.message || err.message;
    return { text: `Claude couldn't accept this request: ${detail}`, retry: false };
  }
  if (err instanceof Anthropic.InternalServerError) {
    return { text: "Claude is busy right now. Press Retry in a moment.", retry: true };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { text: "Couldn't reach Claude. Check your internet connection, then press Retry.", retry: true };
  }
  if (err instanceof Anthropic.APIError) {
    return { text: `Something went wrong (error ${err.status ?? "unknown"}). Press Retry.`, retry: true };
  }
  return { text: "Something went wrong. Press Retry.", retry: true };
}

function setBusy(on) {
  busy = on;
  el.send.hidden = on;
  el.stop.hidden = !on;
}

async function ask() {
  el.welcome.hidden = true;
  const ai = aiNode();
  ai.thinking();
  el.thread.append(ai.node);
  toBottom();

  const c = getClient();
  if (!c) {
    ai.setText("");
    ai.setNote("Add your Claude API key to get answers.", true);
    ai.setActions(null, { settings: true });
    openSettings();
    return;
  }

  setBusy(true);
  let text = "";
  try {
    const stream = c.beta.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: { effort: state.effort },
      // If a safety check declines a request, the API retries it on a suitable fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: systemPrompt(state.mode),
      messages: buildMessages(),
    });
    currentStream = stream;
    stream.on("text", (delta) => {
      text += delta;
      const stick = nearBottom();
      ai.setText(text);
      if (stick) toBottom();
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      // Partial output from a declined request is not a usable answer.
      ai.setText("");
      ai.setNote("Claude can't help with this request. Try asking it another way.", true);
      ai.setActions(null);
      return;
    }
    const finalText = message.content.filter((b) => b.type === "text").map((b) => b.text).join("") || text;
    const note = message.stop_reason === "max_tokens" ? "This answer was cut short. Ask me to continue." : "";
    const turn = { role: "assistant", text: finalText, note };
    state.turns.push(turn);
    ai.setText(finalText);
    ai.setNote(note, false);
    ai.setActions(turn);
  } catch (err) {
    if (err instanceof Anthropic.APIUserAbortError) {
      if (text.trim()) {
        const turn = { role: "assistant", text, note: "Stopped." };
        state.turns.push(turn);
        ai.setText(text);
        ai.setNote("Stopped.", false);
        ai.setActions(turn);
      } else {
        ai.setText("");
        ai.setNote("Stopped.", false);
        ai.setActions(null, { retry: true });
      }
    } else {
      const e = errorCopy(err);
      ai.setText(text);
      ai.setNote(e.text, true);
      ai.setActions(null, { retry: !!e.retry, settings: !!e.settings });
      console.error(err);
    }
  } finally {
    currentStream = null;
    setBusy(false);
    saveState();
  }
}

function send(rawText) {
  if (busy) return;
  const text = (rawText || "").trim();
  if (!text && !pending) return;
  const turn = { role: "user", text: text || "Here is a product photo. Please help with it." };
  if (pending) {
    turn.image = { media_type: pending.media_type, data: pending.data, url: pending.url };
    turn.photo = true;
  }
  state.turns.push(turn);
  el.welcome.hidden = true;
  el.thread.append(userNode(turn));
  pending = null;
  el.preview.hidden = true;
  el.file.value = "";
  el.input.value = "";
  autoGrow();
  saveState();
  ask();
}

// ---------- Photos ----------
async function prepareImage(file) {
  const bitmapUrl = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = bitmapUrl;
  await img.decode();
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // transparent PNGs get a white background
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(bitmapUrl);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return { media_type: "image/jpeg", data: dataUrl.split(",")[1], url: dataUrl };
}

async function setAttachment(file) {
  if (!file) return;
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
    showNotice("Please choose a JPG, PNG, WebP or GIF photo.");
    return;
  }
  try {
    const prepared = await prepareImage(file);
    pending = { ...prepared, name: file.name || "Pasted photo" };
    el.previewImg.src = prepared.url;
    el.previewName.textContent = pending.name;
    el.preview.hidden = false;
    showNotice("");
    el.input.focus();
  } catch {
    showNotice("That photo couldn't be opened. Try a different file.");
  }
}

// ---------- Composer ----------
function autoGrow() {
  el.input.style.height = "auto";
  el.input.style.height = Math.min(el.input.scrollHeight, 200) + "px";
}
el.input.addEventListener("input", autoGrow);
el.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send(el.input.value);
  }
});
el.input.addEventListener("paste", (e) => {
  const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith("image/"));
  if (f) { e.preventDefault(); setAttachment(f); }
});
el.form.addEventListener("submit", (e) => { e.preventDefault(); send(el.input.value); });
el.stop.addEventListener("click", () => currentStream?.abort());
el.attach.addEventListener("click", () => el.file.click());
el.file.addEventListener("change", () => setAttachment(el.file.files?.[0]));
el.previewRemove.addEventListener("click", () => { pending = null; el.preview.hidden = true; el.file.value = ""; });
el.form.addEventListener("dragover", (e) => { e.preventDefault(); el.form.classList.add("drop"); });
el.form.addEventListener("dragleave", () => el.form.classList.remove("drop"));
el.form.addEventListener("drop", (e) => {
  e.preventDefault();
  el.form.classList.remove("drop");
  setAttachment([...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith("image/")));
});
el.effort.addEventListener("change", () => { state.effort = el.effort.value; saveState(); });

let armTimer = null;
const ncLabel = el.newChat.querySelector(".nc-label");
function disarm() { clearTimeout(armTimer); el.newChat.classList.remove("armed"); ncLabel.textContent = "New chat"; el.newChat.title = "New chat"; }
el.newChat.addEventListener("click", () => {
  if (state.turns.length && !el.newChat.classList.contains("armed")) {
    el.newChat.classList.add("armed");
    ncLabel.textContent = "Tap again to clear";
    el.newChat.title = "Tap again to clear the chat";
    clearTimeout(armTimer);
    armTimer = setTimeout(disarm, 3000);
    return;
  }
  disarm();
  currentStream?.abort();
  if (canSpeak) window.speechSynthesis.cancel();
  state.turns = [];
  pending = null;
  el.preview.hidden = true;
  renderAll();
  saveState();
  el.input.focus();
});

// ---------- Voice typing (browser speech recognition) ----------
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Recognition) {
  let rec = null;
  let base = "";
  el.mic.hidden = false;
  const join = (a, b) => (a && b ? a.replace(/\s+$/, "") + " " + b.replace(/^\s+/, "") : a || b || "");
  const setListening = (on) => {
    el.mic.classList.toggle("on", on);
    el.mic.setAttribute("aria-pressed", String(on));
    el.mic.title = on ? "Stop listening" : "Speak your message";
  };
  el.mic.addEventListener("click", () => {
    if (rec) { rec.stop(); return; }
    rec = new Recognition();
    rec.lang = prefs.voiceLang;
    rec.interimResults = true;
    rec.continuous = true;
    base = el.input.value;
    rec.onresult = (e) => {
      let finalText = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      if (finalText) base = join(base, finalText);
      el.input.value = join(base, interim);
      autoGrow();
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        showNotice("Microphone access is blocked. Allow it in your browser's site settings to use voice typing.");
      }
    };
    rec.onend = () => { rec = null; setListening(false); };
    try { rec.start(); setListening(true); } catch { rec = null; }
  });
}

// ---------- Settings sheet ----------
function openSettings() {
  el.apiKey.value = apiKey;
  el.apiKey.type = "password";
  el.toggleKey.textContent = "Show";
  el.rememberKey.checked = !!store.get("localStorage", KEY_STORE) || !apiKey;
  el.voiceLang.value = prefs.voiceLang;
  el.settingsMsg.textContent = "";
  el.settingsMsg.classList.remove("err");
  if (typeof el.settings.showModal === "function") el.settings.showModal();
  el.apiKey.focus();
}
el.settingsBtn.addEventListener("click", openSettings);
el.connectBtn.addEventListener("click", openSettings);
el.cancelSettings.addEventListener("click", () => el.settings.close());
el.toggleKey.addEventListener("click", () => {
  const show = el.apiKey.type === "password";
  el.apiKey.type = show ? "text" : "password";
  el.toggleKey.textContent = show ? "Hide" : "Show";
});
el.forgetKey.addEventListener("click", () => {
  apiKey = "";
  client = null;
  store.remove("localStorage", KEY_STORE);
  store.remove("sessionStorage", KEY_STORE);
  el.apiKey.value = "";
  el.settingsMsg.classList.remove("err");
  el.settingsMsg.textContent = "Key removed from this device.";
  renderWelcome();
});
el.settingsForm.addEventListener("submit", (e) => {
  const key = el.apiKey.value.trim();
  if (key && !key.startsWith("sk-ant-")) {
    e.preventDefault();
    el.settingsMsg.textContent = "That doesn't look like a Claude API key. It should start with sk-ant-.";
    el.settingsMsg.classList.add("err");
    return;
  }
  if (key !== apiKey) client = null;
  apiKey = key;
  store.remove("localStorage", KEY_STORE);
  store.remove("sessionStorage", KEY_STORE);
  if (key) store.set(el.rememberKey.checked ? "localStorage" : "sessionStorage", KEY_STORE, key);
  prefs.voiceLang = el.voiceLang.value;
  store.set("localStorage", PREFS_STORE, JSON.stringify(prefs));
  showNotice("");
  renderWelcome();
});

// ---------- Start ----------
loadState();
el.effort.value = state.effort;
renderModes();
renderAll();
