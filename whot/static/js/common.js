// Shared helpers: identity, toast, icons, card drawing, PWA install + service worker.
const SHAPE_NAMES = { circle: "Circle", triangle: "Triangle", cross: "Cross", square: "Square", star: "Star" };
const PATHS = {
  circle: '<circle cx="12" cy="12" r="9.5"/>',
  triangle: '<polygon points="12,2.5 22.5,21 1.5,21"/>',
  cross: '<path d="M9 1.5h6v7.5h7.5v6H15v7.5H9V15H1.5V9H9z"/>',
  square: '<rect x="3" y="3" width="18" height="18" rx="2.5"/>',
  star: '<polygon points="12,1.5 15,8.4 22.5,9.1 16.8,14 18.6,21.5 12,17.6 5.4,21.5 7.2,14 1.5,9.1 9,8.4"/>',
};
const ICONS = {
  crown: '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M5 20h14"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="m15.41 6.51-6.82 3.98"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  mute: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>',
};
const icon = (name) => `<i class="ico" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONS[name] || ""}</svg></i>`;
function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => { el.outerHTML = icon(el.dataset.icon); });
}

function shapeSVG(shape) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${PATHS[shape]}</svg>`;
}

// size: xs | sm | md | lg. tag: "div" or "button" (hand cards are buttons so they work with a keyboard).
function cardHTML(c, cls = "", size = "md", tag = "div") {
  if (c.shape === "whot") {
    return `<${tag} class="wc whot ${size} ${cls}" data-id="${c.id}" aria-label="Whot 20"><span class="cn tl">20</span><span class="cn br">20</span><span class="mid"><span class="whot-word">WHOT</span></span></${tag}>`;
  }
  return `<${tag} class="wc ${size} ${cls}" data-id="${c.id}" aria-label="${SHAPE_NAMES[c.shape]} ${c.num}">
    <span class="cn tl">${c.num}${shapeSVG(c.shape)}</span><span class="cn br">${c.num}${shapeSVG(c.shape)}</span>
    <span class="mid">${shapeSVG(c.shape)}</span></${tag}>`;
}
const cardBackHTML = (size = "md", cls = "") =>
  `<div class="wc back ${size} ${cls}" aria-hidden="true"><span class="mid"><span class="whot-word">WHOT</span></span></div>`;

function myId() {
  let id = localStorage.getItem("whot_pid");
  if (!id || id.length < 8) {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    id = Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("whot_pid", id);
  }
  return id;
}
const getName = () => { try { return localStorage.getItem("whot_name") || ""; } catch { return ""; } };
const setName = (n) => { try { localStorage.setItem("whot_name", n); } catch { /* storage blocked */ } };

let toastTimer;
function toast(msg, kind = "") {
  const t = document.getElementById("toast");
  t.className = "show " + kind;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ""), 2600);
}

// ----- PWA -----
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {}));
}
let deferredInstall;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstall = e;
  const b = document.getElementById("installBtn");
  if (b) b.hidden = false;
});
window.addEventListener("appinstalled", () => {
  const b = document.getElementById("installBtn");
  if (b) b.hidden = true;
});
document.addEventListener("DOMContentLoaded", () => {
  hydrateIcons();
  const b = document.getElementById("installBtn");
  if (b) b.addEventListener("click", async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    b.hidden = true;
  });
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const tip = document.getElementById("iosTip");
  if (tip && ios && !standalone) tip.hidden = false;
});