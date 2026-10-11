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
  "lastfm-widget": "",
  booking: "https://cal.com/anna-volkova-selo8r/30min",
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

function initBooking() {
  const container = document.querySelector(".booking-embed");

  function embed() {
    const Cal = loadCal();
    Cal("init", CAL.namespace);
    const cal = Cal.ns[CAL.namespace];
    cal("inline", { elementOrSelector: container, calLink: CAL.link, config: CAL.config });
    cal("ui", CAL.ui);
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

// Desktop scrolling moves one section per gesture: a trackpad swipe (with
// its momentum) or a burst of mouse-wheel scrolling glides to the next stop
// and no further. The stops are the CSS scroll-snap targets in styles.css.
// Used only where those stops are firm (same media query as the CSS);
// scrolling inside something scrollable, such as the calendar, is left alone.
//
// A wheel event starts a new gesture when
//  - it follows a pause of GESTURE_GAP ms, or
//  - it goes the opposite way to the last section move, or
//  - the deltas pick up again (a fresh swipe while the previous one's
//    momentum is still trailing off), at least LOCK ms after the last move.
// A new gesture moves on from where the previous move is heading, so a quick
// second swipe isn't lost while the page is still gliding.
const SECTION_SCROLL = "(min-width: 1024px) and (min-height: 780px)";
const GESTURE_GAP = 200;
const LOCK = 450;

function initSectionScroll() {
  const wide = window.matchMedia(SECTION_SCROLL);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const targets = [".work", ".quests .section-title"].map((s) => document.querySelector(s));
  let lastTime = -Infinity;
  let lastAbs = 0;
  let lastMove = { time: -Infinity, dir: 0, target: null };

  function stops() {
    const max = document.documentElement.scrollHeight - innerHeight;
    const starts = targets.map((el) => el.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(el).scrollMarginTop));
    return [0, ...starts, max].map((y) => Math.round(Math.min(max, Math.max(0, y))));
  }

  function scrollsInside(el, dy) {
    for (; el && el !== document.body; el = el.parentElement) {
      const overflow = getComputedStyle(el).overflowY;
      if ((overflow === "auto" || overflow === "scroll") && el.scrollHeight > el.clientHeight + 1) {
        if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
      }
    }
    return false;
  }

  window.addEventListener("wheel", (e) => {
    if (!wide.matches || e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    if (document.querySelector("dialog[open]") || scrollsInside(e.target, e.deltaY)) return;
    e.preventDefault();
    const now = e.timeStamp;
    const abs = Math.abs(e.deltaY);
    const dir = Math.sign(e.deltaY);
    const fresh = now - lastTime > GESTURE_GAP
      || (dir !== lastMove.dir && abs >= 2)
      || (abs > lastAbs * 1.5 && abs > 4 && now - lastMove.time > LOCK);
    lastTime = now;
    lastAbs = abs;
    if (!fresh) return;
    const gliding = lastMove.target !== null && now - lastMove.time < 1200 && Math.abs(scrollY - lastMove.target) > 2;
    const from = gliding ? lastMove.target : scrollY;
    const all = stops();
    const next = dir > 0 ? all.find((s) => s > from + 2) : all.reverse().find((s) => s < from - 2);
    lastMove = { time: now, dir, target: next ?? from };
    if (next !== undefined) window.scrollTo({ top: next, behavior: reducedMotion.matches ? "auto" : "smooth" });
  }, { passive: false });
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

applyLinks();
hideMissingImages();
initTabs();
initQuests();
initBooking();
initNudge();
initSectionScroll();
for (const canvas of document.querySelectorAll("canvas.stipple")) mountParticles(canvas);
