// Case study pages (on-my-disk.html). The screen in the opening drifts down
// as the page scrolls, so it moves slower than the page; the research
// question rises a little under the mouse, as the lore page's papers do
// (js/rise.js). Neither moves with reduced motion. The ← stays in the
// corner, and turns brown past the opening.
import { riseOnHover } from "./rise.js";

const DRIFT = 0.4;             // px the screen moves down per px scrolled

export function initStudy() {
  const study = document.querySelector(".study");
  if (!study) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const banner = study.querySelector(".cs-banner");
  const back = study.querySelector(".cs-back");
  const question = study.querySelector(".cs-question");
  if (banner) drift(banner, reducedMotion);
  if (banner && back) recolor(back, banner);
  if (question) riseOnHover(question);
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

// Once the opening has scrolled up past the middle of the ←, the ← is over
// the page's colour and turns brown (is-on-light), as the phone menu's
// button does past the photo (js/main.js).
function recolor(back, banner) {
  const update = () => {
    const r = back.getBoundingClientRect();
    back.classList.toggle("is-on-light", banner.getBoundingClientRect().bottom < r.top + r.height / 2);
  };
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
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
