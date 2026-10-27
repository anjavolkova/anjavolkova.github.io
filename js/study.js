// Case study pages (on-my-disk.html). Text rises out of a blur as it scrolls
// into view, a little apart when several come in together. In place of the
// menu, pills at the bottom go back to the work, say which section you're
// in (with a rule that fills as you read), and step up or down to the
// previous or next one.
const REVEAL_STAGGER = 80;   // ms between things that come into view together
const SECTION_GAP = 40;      // px left above a section after a step

export function initStudy() {
  const study = document.querySelector(".study");
  if (!study) return;
  revealOnScroll(study);
  sectionPills(study);
  if (document.documentElement.classList.contains("in-panel")) closesPanel(study);
}

// Inside the homepage's panel (js/panel.js), the way back to the work (the
// ← and the other case studies, until they have pages of their own) closes
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

// The page hid the text from the first paint (html.reveal-on, not with
// reduced motion); reveal-ready tells it this script is here to show it.
function revealOnScroll(study) {
  const root = document.documentElement;
  root.classList.add("reveal-ready");
  if (!root.classList.contains("reveal-on")) return;
  const observer = new IntersectionObserver((entries) => {
    entries.filter((entry) => entry.isIntersecting).forEach(({ target }, i) => {
      target.style.setProperty("--reveal-delay", `${i * REVEAL_STAGGER}ms`);
      target.classList.add("is-in");
      observer.unobserve(target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.1 });
  for (const el of study.querySelectorAll(".reveal")) observer.observe(el);
}

// You're in the last section whose rule has passed the top third of the
// window (before the first, the opening: the label it starts with). The
// pills show until the list of the other case studies is halfway up the
// window; that's the end of the read.
function sectionPills(study) {
  const pills = study.querySelector(".study-controls");
  const rules = [...study.querySelectorAll("[data-section]")];
  if (!pills || !rules.length) return;
  const label = pills.querySelector(".study-sections-label");
  const opening = label.textContent.trim();
  const [up, down] = pills.querySelectorAll(".study-sections-step");
  const end = study.querySelector(".study-more-list");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let current = null;

  const update = () => {
    const line = window.innerHeight / 3;
    const index = rules.findLastIndex((rule) => rule.getBoundingClientRect().top < line);
    const endTop = end ? end.getBoundingClientRect().top + window.scrollY : document.documentElement.scrollHeight;
    const read = window.scrollY / Math.max(1, endTop - window.innerHeight / 2);
    pills.style.setProperty("--read", Math.min(1, Math.max(0, read)).toFixed(4));
    pills.classList.toggle("is-shown", read < 1);
    if (index === current) return;
    const first = current === null;
    current = index;
    up.disabled = index < 0;
    down.disabled = index >= rules.length - 1;
    label.querySelector("span").textContent = index < 0 ? opening : rules[index].textContent.trim();
    if (first || reducedMotion.matches) return;
    label.classList.remove("is-new");
    void label.offsetWidth;   // restart the swap
    label.classList.add("is-new");
  };

  // Up from the first section goes back to the top. (Measured from the
  // section, as its rule may not have risen into place yet.)
  const step = (by) => {
    const target = rules[current + by]?.closest("section");
    const top = target ? target.getBoundingClientRect().top + window.scrollY - SECTION_GAP : 0;
    window.scrollTo({ top, behavior: reducedMotion.matches ? "auto" : "smooth" });
  };
  up.addEventListener("click", () => step(-1));
  down.addEventListener("click", () => step(1));

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
