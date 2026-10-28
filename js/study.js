// Case study pages (on-my-disk.html). The screen in the opening drifts down
// a little as the page scrolls, so it moves slower than the page; the
// research question rises a little under the mouse, as the lore page's
// papers do. Neither moves with reduced motion (the question's shadow still
// deepens).
const DRIFT = 0.15;            // px the screen moves down per px scrolled
const HOVER_STIFFNESS = 320;   // the lore papers' hover spring (js/lore.js)
const RISE = 4;                // px it rises, as they do

export function initStudy() {
  const study = document.querySelector(".study");
  if (!study) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const banner = study.querySelector(".cs-banner");
  const question = study.querySelector(".cs-question");
  if (banner) drift(banner, reducedMotion);
  if (question) riseOnHover(question, reducedMotion);
  if (document.documentElement.classList.contains("in-panel")) closesPanel(study);
}

function drift(banner, reducedMotion) {
  const mockup = banner.querySelector(".cs-mockup");
  if (!mockup) return;
  let queued = false;
  const update = () => {
    queued = false;
    const scrolled = reducedMotion.matches ? 0 : Math.max(0, -banner.getBoundingClientRect().top);
    if (scrolled > banner.offsetHeight) return;   // out of sight
    mockup.style.setProperty("--drift", `${(scrolled * DRIFT).toFixed(1)}px`);
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  update();
}

// The same critically damped spring as a lore paper's hover: it rises RISE
// px, straight up, and its shadow comes in to a quarter of a lifted
// paper's.
function riseOnHover(el, reducedMotion) {
  let hover = 0;
  let speed = 0;
  let to = 0;
  let raf = null;
  let last = 0;

  const frame = (now) => {
    const dt = Math.min(1 / 30, Math.max(0, now - last) / 1000 || 1 / 60);
    last = now;
    speed += (HOVER_STIFFNESS * (to - hover) - 2 * Math.sqrt(HOVER_STIFFNESS) * speed) * dt;
    hover += speed * dt;
    const settled = Math.abs(hover - to) < 0.002 && Math.abs(speed) < 0.01;
    if (settled) { hover = to; speed = 0; }
    const motion = reducedMotion.matches ? 0 : 1;
    el.style.setProperty("--rise", `${(-RISE * hover * motion).toFixed(2)}px`);
    el.style.setProperty("--lift", (hover * 0.25).toFixed(3));
    raf = settled ? null : requestAnimationFrame(frame);
  };
  const set = (on) => {
    to = on ? 1 : 0;
    if (raf == null) { last = performance.now(); raf = requestAnimationFrame(frame); }
  };
  el.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") set(true); });
  el.addEventListener("pointerleave", () => set(false));
}

// Inside the homepage's panel (js/panel.js), the way back to the work closes
// the panel instead, and so does Esc. Other links of the site's open in the
// page rather than in the panel.
function closesPanel(study) {
  const closePanel = () => window.parent.postMessage("close-study", location.origin);
  study.addEventListener("click", (e) => {
    const link = e.target.closest("a[href]");
    if (!link || link.origin !== location.origin) return;
    if (/\/(index\.html)?$/.test(link.pathname)) {
      e.preventDefault();
      closePanel();
    } else {
      link.target = "_top";
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });
}
