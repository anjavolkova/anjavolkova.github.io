// Case study pages (on-my-disk.html). Text rises out of a blur as it scrolls
// into view, a little apart when several come in together, and a pill at the
// bottom says which section you're in, with a step up or down to the
// previous or next one and a rule that fills as you read.
const REVEAL_STAGGER = 80;   // ms between things that come into view together
const SECTION_GAP = 40;      // px left above a section after a step

export function initStudy() {
  const study = document.querySelector(".study");
  if (!study) return;
  revealOnScroll(study);
  sectionPill(study);
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
// window; the pill shows from the first one on, until the links at the end
// come up.
function sectionPill(study) {
  const pill = study.querySelector(".study-sections");
  const rules = [...study.querySelectorAll("[data-section]")];
  if (!pill || !rules.length) return;
  const label = pill.querySelector(".study-sections-label");
  const [up, down] = pill.querySelectorAll(".study-sections-step");
  const end = study.querySelector(".study-end");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let current = -1;

  const update = () => {
    const line = window.innerHeight / 3;
    const index = rules.findLastIndex((rule) => rule.getBoundingClientRect().top < line);
    // Read to the end: the links at the end are coming up.
    const endTop = end ? end.getBoundingClientRect().top + window.scrollY : document.documentElement.scrollHeight;
    const read = window.scrollY / Math.max(1, endTop - window.innerHeight);
    pill.style.setProperty("--read", Math.min(1, Math.max(0, read)).toFixed(4));
    pill.classList.toggle("is-shown", index >= 0 && read < 1);
    if (index === current) return;
    current = index;
    down.disabled = index >= rules.length - 1;
    if (index < 0) return;
    label.querySelector("span").textContent = rules[index].textContent.trim();
    if (reducedMotion.matches) return;
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
