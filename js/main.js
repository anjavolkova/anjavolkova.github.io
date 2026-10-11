import { mountParticles } from "./particles.js";

// Destinations still to be supplied. Any link left empty keeps href="#".
const LINKS = {
  lore: "",
  "study-node": "",
  "study-lumia": "",
  "study-smm": "",
  "study-home": "",
  shop: "",
  "lastfm-widget": "",
  booking: "",   // booking page; also embedded in the contact panel when set
  linkedin: "",
  instagram: "",
  github: "https://github.com/anjavolkova",
  email: "",     // plain address, e.g. "hello@example.com"
};

function applyLinks() {
  for (const a of document.querySelectorAll("[data-link]")) {
    let url = LINKS[a.dataset.link];
    if (!url) continue;
    if (a.dataset.link === "email") url = `mailto:${url}`;
    a.href = url;
    if (/^https?:/.test(url)) {
      a.target = "_blank";
      a.rel = "noopener";
    }
  }

  if (LINKS.booking) {
    const embed = document.querySelector(".booking-embed");
    embed.src = LINKS.booking;
    embed.hidden = false;
    document.querySelector(".booking-fallback").hidden = true;
  }
}

// Hide images that failed to load rather than showing broken-image icons.
function hideMissingImages() {
  const hide = (img) => img.classList.add("is-missing");
  for (const img of document.images) {
    if (img.complete && img.naturalWidth === 0) hide(img);
    else img.addEventListener("error", () => hide(img), { once: true });
  }
}

// WAI-ARIA tabs with automatic activation: arrow keys, Home and End move
// between projects; the visual, metadata, badges and CTA swap together.
function initTabs() {
  const tabs = [...document.querySelectorAll(".work-tab")];

  function select(tab, { focus = false } = {}) {
    for (const t of tabs) {
      const active = t === tab;
      t.setAttribute("aria-selected", String(active));
      t.tabIndex = active ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !active;
    }
    if (focus) tab.focus();
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(tab);
      const next = {
        ArrowRight: tabs[(i + 1) % tabs.length],
        ArrowLeft: tabs[(i - 1 + tabs.length) % tabs.length],
        Home: tabs[0],
        End: tabs[tabs.length - 1],
      }[e.key];
      if (!next) return;
      e.preventDefault();
      select(next, { focus: true });
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }
}

// Side quests: hovering, focusing or tapping a collage piece shows its note.
// The note stays while the pointer is anywhere in the collage area, so its
// link can be reached, and hides once the pointer (or focus) leaves it.
// Switching from one note to another waits briefly, so crossing a piece on
// the way to a link doesn't swap the note out.
const HOVER_SWITCH_DELAY = 150;

function initQuests() {
  const layout = document.querySelector(".quests-layout");
  const noteFor = (piece) => document.getElementById(piece.getAttribute("aria-describedby")).closest(".quest");
  let active = null;
  let hoverTimer = null;

  function activate(piece) {
    clearTimeout(hoverTimer);
    if (piece === active) return;
    if (active) {
      active.classList.remove("is-active");
      noteFor(active).classList.remove("is-active");
    }
    active = piece;
    if (piece) {
      piece.classList.add("is-active");
      noteFor(piece).classList.add("is-active");
    }
  }

  for (const piece of document.querySelectorAll(".piece")) {
    piece.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse") return;
      clearTimeout(hoverTimer);
      if (active) hoverTimer = setTimeout(() => activate(piece), HOVER_SWITCH_DELAY);
      else activate(piece);
    });
    piece.addEventListener("pointerleave", () => clearTimeout(hoverTimer));
    piece.addEventListener("focus", () => activate(piece));
    piece.addEventListener("click", () => activate(piece));
  }
  layout.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse" && !layout.querySelector(":focus-visible")) activate(null);
  });
  layout.addEventListener("focusout", (e) => {
    if (!layout.contains(e.relatedTarget)) activate(null);
  });
}

applyLinks();
hideMissingImages();
initTabs();
initQuests();
for (const canvas of document.querySelectorAll("canvas.stipple")) mountParticles(canvas);
