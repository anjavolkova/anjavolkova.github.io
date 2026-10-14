import { mountParticles } from "./particles.js";
import { loadCal } from "./cal-embed.js";

// Destinations still to be supplied. Any link left empty keeps href="#".
const LINKS = {
  lore: "",
  "study-node": "",
  "study-lumia": "",
  "study-smm": "",
  "study-home": "",
  shop: "",
  "lastfm-widget": "https://lastfm-notion-widget.vercel.app/",
  booking: "https://cal.com/anna-volkova-selo8r/30min",
  linkedin: "https://www.linkedin.com/in/iamannavolkova/",
  instagram: "https://www.instagram.com/heartseas.studio/",
  github: "https://github.com/anjavolkova",
  email: "iamannavolkova@gmail.com",     // plain address, e.g. "hello@example.com"
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

}

// Underline the menu link of the section in view: the one crossing a line a
// third of the way down the screen (the last one once the page bottoms out).
function initNav() {
  const items = [...document.querySelectorAll('.nav a[href^="#"]:not(.nav-brand)')]
    .map((link) => ({ link, section: document.getElementById(link.getAttribute("href").slice(1)) }))
    .filter(({ section }) => section);
  let current = null;

  function update() {
    const line = window.innerHeight / 3;
    const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    const item = atBottom ? items.at(-1) : items.find(({ section }) => {
      const r = section.getBoundingClientRect();
      return r.top <= line && r.bottom > line;
    });
    const link = item?.link ?? null;
    if (link === current) return;
    current?.removeAttribute("aria-current");
    current = link;
    current?.setAttribute("aria-current", "location");
  }

  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; update(); });
  };
  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  update();
}

// Phones: the menu button opens the links as a full-screen menu over a
// blurred page. Picking a link, the × or Esc closes it. The button stays
// pinned: cream over the hero photo, plum once the page below reaches it.
const PHONE = window.matchMedia("(max-width: 719px)");

function initMenu() {
  const root = document.documentElement;
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.getElementById("site-nav");
  const photo = document.querySelector(".hero-photo");
  const behind = [document.querySelector("main"), document.querySelector(".site-footer")];

  function recolor() {
    const r = toggle.getBoundingClientRect();
    toggle.classList.toggle("is-on-light", photo.getBoundingClientRect().bottom < r.top + r.height / 2);
  }
  window.addEventListener("scroll", recolor, { passive: true });
  window.addEventListener("resize", recolor);
  recolor();

  function setOpen(open) {
    root.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    for (const el of behind) el.inert = open;
  }

  toggle.addEventListener("click", () => setOpen(!root.classList.contains("menu-open")));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !root.classList.contains("menu-open")) return;
    setOpen(false);
    toggle.focus();
  });
  PHONE.addEventListener("change", () => setOpen(false));
}

// The Cal.com booking calendar, embedded inline in the contact panel. It
// loads once the contact section is near the viewport.
const CAL = {
  namespace: "30min",
  link: "anna-volkova-selo8r/30min",
  config: { layout: "month_view", useSlotsViewOnSmallScreen: "true", theme: "light" },
  ui: {
    cssVarsPerTheme: { light: { "cal-brand": "#271A21" }, dark: { "cal-brand": "#FCFBF8" } },
    hideEventTypeDetails: false,
    layout: "month_view",
  },
};

// Cal.com sizes its iframe to the calendar's exact height, which in Firefox
// leaves the calendar's page a few pixels short, so it shows its own scrollbar
// inside the frame. A little extra height avoids that; the box crops it anyway.
const CAL_EXTRA_HEIGHT = 24;

function padCalFrame(container) {
  let padded = null;
  new MutationObserver(() => {
    const iframe = container.querySelector("iframe");
    const height = iframe?.style.height;
    if (!height?.endsWith("px") || height === padded) return;
    padded = `${parseFloat(height) + CAL_EXTRA_HEIGHT}px`;
    iframe.style.height = padded;
  }).observe(container, { subtree: true, childList: true, attributeFilter: ["style"] });
}

function initBooking() {
  const container = document.querySelector(".booking-embed");

  function embed() {
    const Cal = loadCal();
    Cal("init", CAL.namespace);
    const cal = Cal.ns[CAL.namespace];
    cal("inline", { elementOrSelector: container, calLink: CAL.link, config: CAL.config });
    cal("ui", CAL.ui);
    padCalFrame(container);
  }

  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    embed();
  }, { rootMargin: "800px 0px" });
  observer.observe(container);
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
//
// The current panel fades out (.is-leaving) before the new one animates in
// (.is-entering); see styles.css. Hovering or focusing a tab starts loading
// its panel's images, so they're ready when it opens.
//
// On phones the projects are a feed instead: all of them one after another,
// each under its name bar (the tab buttons, which do nothing there).
const PANEL_OUT = 160;

function initTabs() {
  const tablist = document.querySelector(".work-tabs");
  const tabs = [...document.querySelectorAll(".work-tab")];
  const panelFor = (tab) => document.getElementById(tab.getAttribute("aria-controls"));
  const panels = tabs.map(panelFor);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let switchTimer = null;

  function select(tab, { focus = false } = {}) {
    for (const t of tabs) {
      const active = t === tab;
      t.setAttribute("aria-selected", String(active));
      t.tabIndex = active ? 0 : -1;
    }
    if (focus) tab.focus();

    const next = panelFor(tab);
    const current = panels.find((p) => !p.hidden);
    clearTimeout(switchTimer);
    for (const p of panels) p.classList.remove("is-leaving", "is-entering");
    if (next === current) return;

    const show = () => {
      current?.classList.remove("is-leaving");
      for (const p of panels) p.hidden = p !== next;
      if (!reducedMotion.matches) next.classList.add("is-entering");
    };
    if (reducedMotion.matches || !current) return show();
    current.classList.add("is-leaving");
    switchTimer = setTimeout(show, PANEL_OUT);
  }

  // Switch between tabs (wider screens) and the feed (phones).
  function setMode() {
    clearTimeout(switchTimer);
    for (const p of panels) p.classList.remove("is-leaving", "is-entering");
    if (PHONE.matches) {
      tablist.removeAttribute("role");
      for (const tab of tabs) {
        tab.removeAttribute("role");
        tab.removeAttribute("aria-selected");
        tab.setAttribute("aria-hidden", "true");
        tab.tabIndex = -1;
        panelFor(tab).removeAttribute("role");
        panelFor(tab).hidden = false;
      }
    } else {
      tablist.setAttribute("role", "tablist");
      for (const tab of tabs) {
        tab.setAttribute("role", "tab");
        tab.removeAttribute("aria-hidden");
        panelFor(tab).setAttribute("role", "tabpanel");
      }
      const current = tabs.find((t) => t.getAttribute("aria-selected") === "true") ?? tabs[0];
      for (const p of panels) p.hidden = p !== panelFor(current);
      select(current);
    }
  }

  const preload = (tab) => {
    for (const img of panelFor(tab).querySelectorAll('img[loading="lazy"]')) img.loading = "eager";
  };

  for (const tab of tabs) {
    tab.addEventListener("pointerenter", () => preload(tab));
    tab.addEventListener("focus", () => preload(tab));
    tab.addEventListener("click", () => { if (!PHONE.matches) select(tab); });
    tab.addEventListener("keydown", (e) => {
      if (PHONE.matches) return;
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

  setMode();
  PHONE.addEventListener("change", setMode);
}

// Side quests: resting the pointer on a collage piece (or focusing or
// tapping it) lifts it, puts it on top of the pile and shows its note.
// Pieces keep their new place in the pile, so nothing else shuffles. Passing
// over a piece on the way somewhere else doesn't count: the pointer has to
// slow down on it (less than REST_DISTANCE px moved in REST_INTERVAL ms).
// The last.fm note shows from the start, and the last note shown stays up
// after the pointer leaves.
const REST_INTERVAL = 100;
const REST_DISTANCE = 6;

function initQuests() {
  const collage = document.querySelector(".collage");
  const pieces = [...collage.querySelectorAll(".piece")];
  const noteFor = (piece) => document.getElementById(piece.getAttribute("aria-describedby")).closest(".quest");
  let shownNote = collage.querySelector(".quest.is-active");
  let topOfPile = 10;

  function activate(piece) {
    for (const other of pieces) if (other !== piece) other.classList.remove("is-lifted");
    piece.classList.add("is-lifted");
    if (Number(piece.style.zIndex) !== topOfPile) piece.style.zIndex = ++topOfPile;
    const note = noteFor(piece);
    if (note !== shownNote) {
      shownNote?.classList.remove("is-active");
      shownNote = note;
      note.classList.add("is-active");
    }
  }

  // Mouse: check every REST_INTERVAL ms whether the pointer has come to rest.
  let pointer = null;
  let lastCheck = null;
  let underPointer = null;
  let poll = null;

  collage.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    pointer = { x: e.clientX, y: e.clientY };
    underPointer = e.target.closest(".piece");
    poll ??= setInterval(() => {
      const resting = lastCheck && Math.hypot(pointer.x - lastCheck.x, pointer.y - lastCheck.y) < REST_DISTANCE;
      if (resting && underPointer && !underPointer.classList.contains("is-lifted")) activate(underPointer);
      lastCheck = pointer;
    }, REST_INTERVAL);
  });
  collage.addEventListener("pointerleave", () => {
    clearInterval(poll);
    poll = null;
    lastCheck = null;
  });

  for (const piece of pieces) {
    piece.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") piece.classList.remove("is-lifted");
    });
    piece.addEventListener("focus", () => activate(piece));
    piece.addEventListener("blur", () => piece.classList.remove("is-lifted"));
    piece.addEventListener("click", () => activate(piece));
  }
}

// Phones: the side quests are a row of cards the page pins while you scroll
// through it. The section is one screen tall plus the row's travel (--pin);
// scrolling that distance moves the row along, and a snap stop per card
// settles each swipe on one. The counter follows the card in view.
function initQuestCarousel() {
  const section = document.querySelector(".quests");
  const panel = section.querySelector(".quests-layout");
  const collage = section.querySelector(".collage");
  const notes = [...collage.querySelectorAll(".quest")];
  const now = document.querySelector(".quests-counter-now");
  document.querySelector(".quests-counter-total").textContent = notes.length;
  const stops = notes.map(() => {
    const stop = document.createElement("span");
    stop.className = "quests-stop";
    stop.setAttribute("aria-hidden", "true");
    section.append(stop);
    return stop;
  });

  const travel = () => collage.scrollWidth - collage.clientWidth;

  function follow() {
    if (!PHONE.matches) return;
    const range = section.offsetHeight - panel.offsetHeight;
    const progress = range > 0 ? Math.min(1, Math.max(0, -section.getBoundingClientRect().top / range)) : 0;
    collage.scrollLeft = progress * travel();
    const card = Math.round(progress * (notes.length - 1)) + 1;
    now.textContent = card;
  }

  function layout() {
    if (!PHONE.matches) {
      section.style.removeProperty("--pin");
      collage.scrollLeft = 0;
      return;
    }
    const distance = travel();
    section.style.setProperty("--pin", `${distance}px`);
    stops.forEach((stop, i) => { stop.style.top = `${(distance * i) / (stops.length - 1)}px`; });
    follow();
  }

  window.addEventListener("scroll", follow, { passive: true });
  window.addEventListener("resize", layout);
  PHONE.addEventListener("change", layout);
  layout();
}

// After 60+ seconds of playing with the stipple (moving the pointer over a
// stipple while the shader is running), a message invites the visitor to get
// in touch. Its form is sent through FormSubmit to CONTACT_EMAIL.
const CONTACT_EMAIL = "iamannavolkova@gmail.com";
const PLAY_SECONDS = 60;

function initNudge() {
  const dialog = document.getElementById("nudge");
  const form = document.getElementById("nudge-form");
  const status = form.querySelector(".nudge-status");
  const send = form.querySelector(".nudge-send");
  let played = 0;
  let lastMove = 0;

  function onMove(e) {
    const now = performance.now();
    const over = [...document.querySelectorAll("canvas.stipple")].some((canvas) => {
      if (canvas.dataset.renderer !== "webgpu") return false;
      const r = canvas.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    // Count time between consecutive moves over the stipple; pauses don't count.
    if (over && lastMove) played += Math.min(now - lastMove, 250);
    lastMove = over ? now : 0;
    if (played >= PLAY_SECONDS * 1000) {
      window.removeEventListener("pointermove", onMove);
      dialog.showModal();
    }
  }
  window.addEventListener("pointermove", onMove, { passive: true });

  // The × button, Esc and a click on the dimmed background all close the
  // message, playing the closing animation first.
  function close() {
    if (!dialog.open || dialog.classList.contains("is-closing")) return;
    dialog.classList.add("is-closing");
    const done = () => {
      clearTimeout(fallback);
      dialog.removeEventListener("animationend", onEnd);
      dialog.classList.remove("is-closing");
      dialog.close();
    };
    const onEnd = (e) => { if (e.animationName === "nudge-backdrop-out") done(); };
    const fallback = setTimeout(done, 1200);
    dialog.addEventListener("animationend", onEnd);
  }

  const onBackdrop = (e) => {
    const r = dialog.getBoundingClientRect();
    return e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
  };
  // Only a click that starts and ends on the background counts, so a text
  // selection dragged out of the form doesn't close it.
  let pressedBackdrop = false;
  dialog.addEventListener("pointerdown", (e) => { pressedBackdrop = onBackdrop(e); });
  dialog.addEventListener("click", (e) => { if (pressedBackdrop && onBackdrop(e)) close(); });
  dialog.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  dialog.querySelector('form[method="dialog"]').addEventListener("submit", (e) => { e.preventDefault(); close(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (data._honey) return;
    send.disabled = true;
    status.textContent = "Sending…";
    try {
      const res = await fetch(`https://formsubmit.co/ajax/${CONTACT_EMAIL}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ ...data, _subject: "New message from annavolkova.design" }),
      });
      const reply = await res.json();
      if (!res.ok || String(reply.success) !== "true") throw new Error(reply.message);
      form.reset();
      status.textContent = "Sent, thank you! I’ll get back to you soon.";
    } catch {
      status.textContent = `That didn’t send. You can email me at ${CONTACT_EMAIL} instead.`;
    } finally {
      send.disabled = false;
    }
  });
}

// Page-load intro: start it (html.intro-play, see styles.css and the script
// in <head>) once the hero photo and name artwork are ready, or after 2s.
function initIntro() {
  const root = document.documentElement;
  if (!root.classList.contains("intro")) return;
  const images = [...document.querySelectorAll(".hero-photo img, .hero-name img")];
  const ready = Promise.all(images.map((img) => img.decode().catch(() => {})));
  const timeout = new Promise((resolve) => setTimeout(resolve, 2000));
  Promise.race([ready, timeout]).then(() => requestAnimationFrame(() => root.classList.add("intro-play")));
}

initIntro();
applyLinks();
initNav();
initMenu();
hideMissingImages();
initTabs();
initQuests();
initQuestCarousel();
initBooking();
initNudge();
for (const canvas of document.querySelectorAll("canvas.stipple")) mountParticles(canvas);
