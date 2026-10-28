// Rises a little under the mouse, straight up, as the lore page's papers do
// on hover: the same critically damped spring (js/lore.js), RISE px. Sets
// --rise on the element; the CSS moves it. Not with reduced motion.
const HOVER_STIFFNESS = 320;
const RISE = 4;

// el rises while the mouse is over trigger (el itself by default).
export function riseOnHover(el, trigger = el) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
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
    raf = settled ? null : requestAnimationFrame(frame);
  };
  const set = (on) => {
    to = on ? 1 : 0;
    if (raf == null) { last = performance.now(); raf = requestAnimationFrame(frame); }
  };
  trigger.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") set(true); });
  trigger.addEventListener("pointerleave", () => set(false));
}
