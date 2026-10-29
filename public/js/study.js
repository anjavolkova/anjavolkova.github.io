// Case study pages (on-my-disk.html and the rest). The screen in the
// opening drifts up as the page scrolls, so it moves faster than the page;
// the research question and the impact figures rise a little under the
// mouse, as the lore page's papers do (js/rise.js), and so do the screens
// and phones on paper, each on its own, their paper staying put.
// None of it moves with reduced motion. The ← stays in the corner, and turns
// brown past the opening; the contents come in at the right edge then, the
// section you're in marked. With the page's intro, the read arrives block by
// block as it comes into view.
import { riseOnHover } from "./rise.js";

const DRIFT = 0.2;             // px the screen moves up per px scrolled
const REVEAL_AFTER = 1100;     // ms into the intro: the screen is up by then
const REVEAL_STEP = 60;        // ms between blocks arriving together

export function initStudy() {
  const study = document.querySelector(".study");
  if (!study) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const banner = study.querySelector(".cs-banner");
  const back = study.querySelector(".cs-back");
  const toc = study.querySelector(".toc");
  const question = study.querySelector(".cs-question");
  if (banner) drift(banner, reducedMotion);
  if (banner && back) recolor(back, banner);
  if (banner && toc) contents(toc, banner);
  if (question) riseOnHover(question);
  for (const stat of study.querySelectorAll(".cs-stat")) riseOnHover(stat);
  // One screen on a paper rises with the mouse anywhere on the paper; of
  // several, only the one under the mouse.
  for (const frame of study.querySelectorAll(".cs-frame")) {
    const shots = frame.querySelectorAll(".cs-shot, .cs-phone");
    for (const shot of shots) riseOnHover(shot, shots.length > 1 ? shot : frame);
  }
  if (document.documentElement.classList.contains("intro")) reveal(study);
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
    mockup.style.setProperty("--drift", `${(-scrolled * DRIFT).toFixed(1)}px`);
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

// The read's blocks (.cs-block) arrive as they come into view, as on
// billguo.me's case studies, out of a blur (the CSS): the first ones once
// the intro has brought the screen up, the rest as they're scrolled to,
// those arriving together REVEAL_STEP apart, in reading order.
function reveal(study) {
  const root = document.documentElement;
  const blocks = [...study.querySelectorAll(".cs-block")];
  root.classList.add("reveals");
  const watch = () => {
    const seen = new IntersectionObserver((entries) => {
      entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target)
        .sort((a, b) => blocks.indexOf(a) - blocks.indexOf(b))
        .forEach((block, i) => {
          block.style.setProperty("--reveal-delay", `${i * REVEAL_STEP}ms`);
          block.classList.add("is-revealed");
          seen.unobserve(block);
        });
    }, { rootMargin: "0px 0px -12% 0px" });
    for (const block of blocks) seen.observe(block);
  };
  const afterIntro = () => setTimeout(watch, REVEAL_AFTER);
  if (root.classList.contains("intro-play")) { afterIntro(); return; }
  const wait = new MutationObserver(() => {
    if (!root.classList.contains("intro-play")) return;
    wait.disconnect();
    afterIntro();
  });
  wait.observe(root, { attributes: true, attributeFilter: ["class"] });
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

// The contents (src/components/CaseToc.astro) come in once the opening has
// gone up past them (is-shown). The section you're in is the last whose
// heading has gone above a third of the way down the window, and any
// heading beside it (the problem and the challenge are one place): its
// mark and its name are marked (is-current, aria-current).
function contents(toc, banner) {
  const links = [...toc.querySelectorAll(".toc-link")];
  const marks = [...toc.querySelectorAll(".toc-mark")];
  const headings = links.map((link) => document.getElementById(link.hash.slice(1)));
  let queued = false;
  const update = () => {
    queued = false;
    const tops = headings.map((h) => (h ? h.getBoundingClientRect().top : Infinity));
    const line = innerHeight / 3;
    const passed = tops.filter((top) => top <= line);
    const here = passed.length ? passed[passed.length - 1] : null;
    tops.forEach((top, i) => {
      const current = here !== null && Math.abs(top - here) < 2;
      marks[i].classList.toggle("is-current", current);
      if (current) links[i].setAttribute("aria-current", "location");
      else links[i].removeAttribute("aria-current");
    });
    const r = toc.getBoundingClientRect();
    toc.classList.toggle("is-shown", banner.getBoundingClientRect().bottom < r.top);
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
