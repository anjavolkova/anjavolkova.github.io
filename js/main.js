import { mountParticles } from "./particles.js";
import { loadCal } from "./cal-embed.js";
import { initLore } from "./lore.js";

// Destinations still to be supplied. Any link left empty keeps href="#".
const LINKS = {
  lore: "lore.html",
  resume: "",          // the resume PDF, for the lore page's "Download PDF"
  "study-node": "",
  "study-network": "",
  "study-home": "",
  "study-smm": "",
  "study-files": "",
  "lastfm-widget": "https://lastfm-notion-widget.vercel.app/",
  booking: "https://cal.com/anna-volkova-selo8r/30min",
  linkedin: "https://www.linkedin.com/in/iamannavolkova/",
  instagram: "https://www.instagram.com/heartseas.studio/",
  github: "https://github.com/anjavolkova",
  email: "info@annavolkova.design",     // plain address, e.g. "hello@example.com"
};

function applyLinks() {
  for (const a of document.querySelectorAll("[data-link]")) {
    let url = LINKS[a.dataset.link];
    // No file yet: don't let "Download PDF" download the page itself.
    if (!url) { a.removeAttribute("download"); continue; }
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

  // Pages without the hero photo (lore) keep the plum button throughout.
  function recolor() {
    if (!photo) return;
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
// between projects; the visual, metadata and CTA swap together.
//
// The current panel fades out (.is-leaving) before the new one animates in
// (.is-entering); see styles.css. Hovering or focusing a tab starts loading
// its panel's images, so they're ready when it opens.
//
// On desktop, scrolling stops on the showcase and steps through the projects
// before the page moves on: see stepOnScroll() below.
//
// On phones the projects are a feed instead: all of them one after another,
// each under its name bar (the tab buttons, which do nothing there).
const PANEL_OUT = 160;
const DESKTOP = window.matchMedia("(min-width: 1024px)");
const GESTURE_GAP = 200;   // ms without wheel events that ends a gesture
const STEP_GAP = 450;      // ms: the soonest the next project can follow

function initTabs() {
  const tablist = document.querySelector(".work-tabs");
  if (!tablist) return;
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

  stepOnScroll(tablist.closest(".work"), tabs, select);
  setMode();
  PHONE.addEventListener("change", setMode);
}

// The showcase's scroll stop (whole, at the top of the window) is a hard
// stop for wheels and trackpads. A swipe or a turn of the wheel heading for
// it (down from above, or up from just below) glides the page onto it, not
// past it. Resting on it, one opens the next project, or the previous one
// going up, instead of moving the page; past the last project (or the
// first, going up) the page scrolls on as usual.
//
// Browsers only let a gesture's first wheel event decide whether the page
// scrolls, so what a gesture does is settled then, and the rest of it,
// momentum and all, follows. Wheel events in quick succession are one
// gesture, and so is a trackpad's momentum dying away, while a fresh swipe
// on top of it is a new one.
function stepOnScroll(work, tabs, select) {
  let gesture = null;
  let last = 0;
  let lastStep = -Infinity;

  // How far the showcase is from its stop, in px (more than 0 while the page
  // is above it), or null where there's no hard stop: narrower windows, and
  // windows too short to show the whole showcase.
  const fromStop = () => {
    const stop = parseFloat(getComputedStyle(work).scrollMarginTop) || 0;
    if (!DESKTOP.matches || work.offsetHeight + stop > window.innerHeight + 1) return null;
    return work.getBoundingClientRect().top - stop;
  };

  // A new gesture: held (the page doesn't scroll for it) if it steps to a
  // project or carries the page onto the stop.
  function begin(e, dy) {
    const off = e.cancelable && !e.ctrlKey && dy !== 0 ? fromStop() : null;
    if (off === null) return false;
    if (Math.abs(off) <= 4) {
      const i = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
      const next = tabs[i + Math.sign(dy)];
      if (!next) return false;
      if (e.timeStamp - lastStep >= STEP_GAP) {
        lastStep = e.timeStamp;
        select(next);
        next.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      return true;
    }
    // Going up, only from the stop just below (the side quests), where the
    // showcase's bottom edge is just out of sight.
    const heading = dy > 0 ? off > 0 : off < 0 && work.getBoundingClientRect().bottom > -window.innerHeight / 4;
    if (heading) window.scrollTo({ top: window.scrollY + off });
    return heading;
  }

  window.addEventListener("wheel", (e) => {
    const dy = e.deltaY * [1, 16, window.innerHeight][e.deltaMode];
    const size = Math.abs(dy);
    // A new gesture can't start on an event the browser won't let us cancel:
    // that's the rest of a gesture the page is already scrolling for. A swipe
    // on top of a dying momentum shows as a jump well above what's left of it.
    const recent = gesture ? Math.max(...gesture.recent) : 0;
    const fresh = !gesture || (e.cancelable && (e.timeStamp - last > GESTURE_GAP
      || (size > 10 && size > 2 * recent && recent < gesture.peak / 3)));
    last = e.timeStamp;
    if (fresh) gesture = { held: begin(e, dy), recent: [], peak: 0 };
    gesture.recent = [...gesture.recent.slice(-2), size];
    gesture.peak = Math.max(gesture.peak, size);
    if (gesture.held && e.cancelable) e.preventDefault();
  }, { passive: false });
}

// Over a project's picture area, its picture leans towards the pointer in 3D
// (the side nearest the pointer comes forward), easing after the pointer,
// and settles flat again once it leaves. This sets how far it leans, from
// -1 to 1 each way (--lean-x, --lean-y) and 0 to 1 in all (--lean); the CSS
// turns that into the tilt, the phone's edge, its glare and its shadow.
const TILT_EASE = 0.16;    // seconds: how quickly the picture catches up

function initWorkTilt() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  for (const visual of document.querySelectorAll(".work-visual")) {
    const shot = visual.querySelector(".shot");
    if (!shot) continue;
    const target = { x: 0, y: 0 };
    const now = { ...target };
    let raf = null;
    let last = 0;

    function step(time) {
      const k = 1 - Math.exp(-Math.min(0.05, (time - last) / 1000) / TILT_EASE);
      last = time;
      for (const key in now) now[key] += (target[key] - now[key]) * k;
      const done = Object.keys(now).every((key) => Math.abs(target[key] - now[key]) < 0.001);
      if (done) Object.assign(now, target);
      visual.style.setProperty("--lean-x", now.x.toFixed(4));
      visual.style.setProperty("--lean-y", now.y.toFixed(4));
      visual.style.setProperty("--lean", Math.min(1, Math.hypot(now.x, now.y)).toFixed(4));
      raf = done ? null : requestAnimationFrame(step);
    }
    const kick = () => {
      if (raf == null) { last = performance.now(); raf = requestAnimationFrame(step); }
    };

    visual.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || reducedMotion.matches) return;
      // Where the pointer is from the picture's centre, as a share of half
      // the area, no further than its edge in any direction.
      const area = visual.getBoundingClientRect();
      const pic = shot.getBoundingClientRect();
      let dx = (e.clientX - (pic.left + pic.width / 2)) / (area.width / 2);
      let dy = (e.clientY - (pic.top + pic.height / 2)) / (area.height / 2);
      const d = Math.hypot(dx, dy);
      if (d > 1) { dx /= d; dy /= d; }
      target.x = dx;
      target.y = dy;
      kick();
    });
    visual.addEventListener("pointerleave", () => {
      Object.assign(target, { x: 0, y: 0 });
      kick();
    });
  }
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
  if (!collage) return;
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
// through it. The section is one screen tall plus the row's travel and a
// pause at each end (--pin): the first card holds still for the pause
// (QUESTS_PAUSE of the screen's height), then scrolling moves the row along,
// and the last card holds still for the same pause before the page scrolls
// on. When scrolling stops partway between cards, the page eases to the
// nearest one. The counter follows the card in view.
const QUESTS_PAUSE = 0.4;
const SETTLE_DELAY = 150;

function initQuestCarousel() {
  const section = document.querySelector(".quests");
  if (!section) return;
  const panel = section.querySelector(".quests-layout");
  const collage = section.querySelector(".collage");
  const notes = [...collage.querySelectorAll(".quest")];
  const now = document.querySelector(".quests-counter-now");
  const contact = document.querySelector(".contact");
  const tuck = contact.parentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  document.querySelector(".quests-counter-total").textContent = notes.length;

  const travel = () => collage.scrollWidth - collage.clientWidth;
  const pause = () => panel.offsetHeight * QUESTS_PAUSE;
  // How far the row has moved: 0 at the first card (and through the pause),
  // 1 at the last (below 0 before it, above 1 after).
  const position = () => (-section.getBoundingClientRect().top - pause()) / travel();

  function follow() {
    const progress = Math.min(1, Math.max(0, position()));
    const left = Math.round(progress * travel());
    if (collage.scrollLeft !== left) collage.scrollLeft = left;
    now.textContent = Math.round(progress * (notes.length - 1)) + 1;
    if (tuck.classList.contains("is-jumping") && contact.getBoundingClientRect().top < window.innerHeight / 2) {
      tuck.classList.remove("is-jumping");
    }
  }

  // The contact section rides tucked under the panel, sticky to the bottom
  // of the screen by its height (see styles.css). For a jump to it from a
  // link it's let go until it's in view, so the jump lands where it really is.
  new ResizeObserver(() => contact.style.setProperty("--contact-h", `${contact.offsetHeight}px`)).observe(contact);
  const letGo = () => { if (PHONE.matches) tuck.classList.add("is-jumping"); };
  if (location.hash === "#contact") letGo();
  document.addEventListener("click", (e) => { if (e.target.closest('a[href="#contact"]')) letGo(); });

  function settle() {
    const p = position();
    if (!(p > 0 && p < 1)) return;
    const steps = notes.length - 1;
    const offset = (Math.round(p * steps) / steps - p) * travel();
    if (Math.abs(offset) < 2) return;
    window.scrollTo({ top: window.scrollY + offset, behavior: reducedMotion.matches ? "auto" : "smooth" });
  }

  let queued = false;
  let touching = false;
  let settleTimer = null;
  const settleSoon = () => {
    clearTimeout(settleTimer);
    if (!touching) settleTimer = setTimeout(settle, SETTLE_DELAY);
  };

  window.addEventListener("scroll", () => {
    if (!PHONE.matches) return;
    if (!queued) {
      queued = true;
      requestAnimationFrame(() => { queued = false; follow(); });
    }
    settleSoon();
  }, { passive: true });
  window.addEventListener("touchstart", () => {
    touching = true;
    tuck.classList.remove("is-jumping");
    clearTimeout(settleTimer);
  }, { passive: true });
  window.addEventListener("touchend", () => { touching = false; settleSoon(); }, { passive: true });

  function layout() {
    if (!PHONE.matches) {
      section.style.removeProperty("--pin");
      tuck.style.removeProperty("--pin");
      tuck.classList.remove("is-jumping");
      collage.scrollLeft = 0;
      return;
    }
    // The pictures' box leaves room for the tallest note (see styles.css).
    const notesHeight = Math.max(...notes.map((note) =>
      note.lastElementChild.getBoundingClientRect().bottom - note.getBoundingClientRect().top));
    collage.style.setProperty("--notes-h", `${Math.ceil(notesHeight)}px`);
    const pin = `${2 * pause() + travel()}px`;
    section.style.setProperty("--pin", pin);
    tuck.style.setProperty("--pin", pin);
    follow();
  }
  window.addEventListener("resize", layout);
  PHONE.addEventListener("change", layout);
  document.fonts.ready.then(layout);
  layout();
}

// After 60+ seconds of playing with the stipple (moving the pointer over a
// stipple while the shader is running), a message invites the visitor to get
// in touch. Its form is sent through FormSubmit to CONTACT_EMAIL. The lore
// page's letter opens the same kind of message from its "Inquiry form".
const CONTACT_EMAIL = "info@annavolkova.design";
const PLAY_SECONDS = 60;

function initNudge() {
  const dialog = document.getElementById("nudge");
  if (!dialog) return;
  initMessage(dialog);
  let played = 0;
  let lastMove = 0;

  function onMove(e) {
    const now = performance.now();
    // The lore page's folder lies over its stipple: time spent there is
    // time with the papers, not the dots.
    const over = !e.target.closest?.(".lore-folder") && [...document.querySelectorAll("canvas.stipple")].some((canvas) => {
      if (canvas.dataset.renderer !== "webgpu") return false;
      const r = canvas.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    // Count time between consecutive moves over the stipple; pauses don't count.
    if (over && lastMove) played += Math.min(now - lastMove, 250);
    lastMove = over ? now : 0;
    if (played >= PLAY_SECONDS * 1000) {
      window.removeEventListener("pointermove", onMove);
      if (!document.querySelector("dialog[open]")) dialog.showModal();
    }
  }
  window.addEventListener("pointermove", onMove, { passive: true });
}

// Buttons with data-opens="<dialog id>" open that message.
function initMessageButtons() {
  for (const button of document.querySelectorAll("[data-opens]")) {
    const dialog = document.getElementById(button.dataset.opens);
    if (!dialog) continue;
    initMessage(dialog);
    button.addEventListener("click", () => dialog.showModal());
  }
}

// A message dialog: the × button, Esc and a click on the dimmed background
// all close it, playing the closing animation first; its form sends.
function initMessage(dialog) {
  const form = dialog.querySelector(".nudge-form");
  const status = form.querySelector(".nudge-status");
  const send = form.querySelector(".nudge-send");

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
// in <head>) once the hero photo and name artwork (or on the lore page, the
// folder and its papers) are ready, or after 2s.
function initIntro() {
  const root = document.documentElement;
  if (!root.classList.contains("intro")) return;
  const images = [...document.querySelectorAll(".hero-photo img, .hero-name img, .lore img")];
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
initWorkTilt();
initQuests();
initQuestCarousel();
initBooking();
initNudge();
initMessageButtons();
initLore();
for (const canvas of document.querySelectorAll("canvas.stipple")) mountParticles(canvas);
