// Lore: a folder of papers (lore.html), and the case studies' folder at the
// end of a case study, which works the same way. The loose papers start in
// a pile on the right; the top one moves over to the left-hand side when it's dragged
// or swiped across, flicked, tapped, scrolled down, or with the → key (or a
// sideways trackpad swipe), and ← (or scrolling up) brings the last one back.
// The resume and the letter stay at the back of the right-hand side, with
// their buttons. In the case studies' folder, a paper with a study
// (data-href) opens it instead when it's clicked or tapped, or with Enter
// while it's on top of the pile on the right.
//
// Each paper keeps its place and rotation from the Figma layouts and only
// slides across. Sent by a key or a tap, it eases over in TURN_MS; let go of
// after a drag, it carries on (or back) on a spring from where it was, at the
// speed it was flicked. On the way over it stays flat on the folder, like a
// sheet being leafed across: it turns a little as it goes and its shadow
// deepens, attached to it. A screenshot clipped to a paper is part of it,
// so it goes along with it.

import { swipeReader } from "./swipes.js";

const FOLDER_WIDTH = 948;   // the folder in Figma, in design units
const TURN_MS = 1000;       // a full turn, sent by a key or a tap
const STIFFNESS = 40;       // spring after a drag
const DAMPING = 0.86;       // just under critical: the paper settles, barely overshooting
const HOVER_STIFFNESS = 320;
const ENGAGE = 8;           // px of sideways movement before a drag takes hold
const REST_MS = 500;        // how long the pointer rests on the cloister photo before its caption shows
const REST_SLACK = 4;       // px the pointer can wander and still count as resting
const SCROLL_DRAG = 1.5;    // px a paper moves per px scrolled
const SCROLL_IDLE = 120;    // ms without wheel events that lets go of a scrolled paper
const SCROLL_STRETCH = 24;  // units a scrolled paper can stretch past where it lands
const RESUME_PAUSE = 1500;  // ms scrolling holds on the resume once the last paper is across

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The folder's focus ring (styles.css) shows when it's reached with Tab,
// not when it's clicked and then leafed through with the arrow keys.
let tabbing = false;

export function initLore() {
  const folders = document.querySelectorAll(".lore-folder");
  if (!folders.length) return;
  document.addEventListener("keydown", (e) => { if (e.key === "Tab") tabbing = true; });
  document.addEventListener("pointerdown", () => { tabbing = false; }, true);
  for (const folder of folders) initFolder(folder);
}

function initFolder(folder) {
  const status = document.getElementById(folder.getAttribute("aria-describedby"));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const canHover = window.matchMedia("(hover: hover)");

  const num = (el, name) => parseFloat(el.style.getPropertyValue(name)) || 0;
  const make = (el, i, fixed) => ({
    el, i, fixed,
    hit: el.querySelector(".sheet-hit"),
    dx: fixed ? 0 : num(el, "--left") - num(el, "--x"),
    label: el.dataset.label || "",
    href: el.dataset.href || "",
    x: 0, v: 0, target: 0,      // offset across, in units (0 = right, dx = left)
    dir: -1,                    // -1 going left, 1 coming back
    hover: 0, hoverV: 0, hoverTo: 0,
    dragY: 0, dragYV: 0,
    drag: null,
    turn: null,                 // an eased turn under way: { from, to, t0, ms }
    flight: 0,                  // order it last took off in, for stacking
  });
  // Top of the pile first: the photo, the vellum card, ... the "things" sheet.
  const papers = [...folder.querySelectorAll(".sheet:not(.sheet--fixed)")].reverse().map((el, i) => make(el, i, false));
  const fixed = [...folder.querySelectorAll(".sheet--fixed")].map((el, i) => make(el, i, true));
  const all = [...papers, ...fixed];
  const byEl = new Map(all.map((p) => [p.el, p]));
  const byName = new Map(all.map((p) => [p.el.dataset.sheet, p]));
  // The paper an element belongs to: its own, or for the resume's and the
  // letter's buttons (which sit above everything), the one they're for.
  const paperOf = (node) => {
    const el = node?.closest?.(".sheet, .pill[data-for]");
    if (!el) return null;
    return el.matches(".pill[data-for]") ? byName.get(el.dataset.for) : byEl.get(el);
  };

  let onLeft = 0;               // how many papers lie on the left
  let flights = 0;
  // A case study's folder starts leafed to the next study: the papers
  // before it lie turned over on the left (data-leafed).
  for (const p of papers.slice(0, Number(folder.dataset.leafed) || 0)) {
    p.x = p.target = p.dx;
    p.flight = ++flights;
    onLeft += 1;
  }
  let unit = 1;                 // px per design unit
  const measure = () => { unit = folder.getBoundingClientRect().width / FOLDER_WIDTH || 1; };

  const topRight = () => papers[onLeft] ?? null;
  const topLeft = () => papers[onLeft - 1] ?? null;
  const isLeft = (p) => p.target !== 0;
  const moving = (p) => p.drag || p.turn || Math.abs(p.x - p.target) > 0.3 || Math.abs(p.v) > 4;
  // Slow to lift, quick across, gentle to land.
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // Which papers can be handled: the top of each pile, and once the pile on
  // the right is gone, the resume and the letter.
  function markTops() {
    const tops = new Set([topRight(), topLeft()].filter(Boolean));
    if (onLeft === papers.length) fixed.forEach((p) => tops.add(p));
    for (const p of all) {
      const top = tops.has(p);
      p.el.classList.toggle("is-top", top);
      if (!top) p.el.classList.remove("is-revealed");
    }
    if (!cloister?.el.classList.contains("is-top")) hideCaption();
    for (const link of folder.querySelectorAll("a.pill, button.pill")) {
      link.tabIndex = paperOf(link)?.el.classList.contains("is-top") ? 0 : -1;
    }
    folder.dataset.left = onLeft;
    folder.classList.toggle("is-through", onLeft === papers.length);
  }

  // Inside the homepage's panel (js/panel.js), a study opens in the page,
  // not in the panel.
  function open(p) {
    const page = document.documentElement.classList.contains("in-panel") ? window.top : window;
    page.location.assign(new URL(p.href, location.href));
  }

  function announce() {
    if (!status) return;
    const p = topRight();
    status.textContent = p
      ? `${p.label}, ${onLeft + 1} of ${papers.length + 1}`
      : `My resume and a letter, ${papers.length + 1} of ${papers.length + 1}`;
  }

  function send(p, toLeft) {
    if (p.hoverTo) setHover(p, false);
    p.target = toLeft ? p.dx : 0;
    p.dir = toLeft ? -1 : 1;
    p.flight = ++flights;
    const share = p.dx ? Math.abs(p.target - p.x) / Math.abs(p.dx) : 0;
    const ms = reducedMotion.matches ? 200 : Math.max(400, TURN_MS * Math.sqrt(share));
    p.turn = { from: p.x, to: p.target, t0: performance.now(), ms };
    kick();
  }

  function next() {
    const p = topRight();
    if (!p) return nudgeFixed();
    onLeft += 1;
    send(p, true);
    markTops();
    announce();
  }

  function prev() {
    const p = topLeft();
    if (!p) return;
    onLeft -= 1;
    send(p, false);
    markTops();
    announce();
  }

  // Nothing left to turn on the right: the resume and letter just stir.
  function nudgeFixed() {
    for (const p of fixed) { p.hoverV += 3; }
    kick();
  }

  // Stacking: the pile on the right, the pile on the left above it (in the
  // order the papers arrived), and anything on the move above both.
  function stackOf(p) {
    if (p.fixed) return 1 + p.i;
    if (moving(p)) return 100 + p.flight;
    return isLeft(p) ? 40 + p.i : 20 + (papers.length - p.i);
  }

  function render(p) {
    const motion = reducedMotion.matches ? 0 : 1;
    const progress = p.dx ? clamp(p.x / p.dx, 0, 1) : 0;
    const mid = Math.sin(Math.PI * progress);   // 0 at either side, 1 half way
    // Hovered, it only rises a little, straight up, so writing on it stays
    // put and level.
    const y = -4 * p.hover * motion + p.dragY;
    const spin = motion * (-2.4 * mid * p.dir + clamp(-p.v * 0.0016, -5, 5));
    const lift = Math.max(mid, p.hover * 0.25, p.drag ? 0.5 : 0);
    p.el.style.transform =
      `translate(${(p.x * unit).toFixed(2)}px, ${(y * unit).toFixed(2)}px) rotate(${spin.toFixed(2)}deg)`;
    p.el.style.setProperty("--lift", lift.toFixed(3));
    p.el.style.zIndex = stackOf(p);
  }

  // One spring step for every paper still on the move.
  let raf = null;
  let last = 0;
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000 || 1 / 60);
    last = now;
    let busy = false;
    const k = reducedMotion.matches ? STIFFNESS * 3 : STIFFNESS;
    const c = 2 * Math.sqrt(k) * DAMPING;
    for (const p of all) {
      if (p.turn && !p.drag) {
        const t = clamp((now - p.turn.t0) / p.turn.ms, 0, 1);
        const x = p.turn.from + (p.turn.to - p.turn.from) * ease(t);
        p.v = dt ? (x - p.x) / dt : 0;
        p.x = x;
        if (t >= 1) { p.turn = null; p.v = 0; }
      } else if (!p.drag) {
        p.v += (k * (p.target - p.x) - c * p.v) * dt;
        p.x += p.v * dt;
      }
      if (!p.drag) {
        p.dragYV += (k * (0 - p.dragY) - c * p.dragYV) * dt;
        p.dragY += p.dragYV * dt;
      }
      const hk = HOVER_STIFFNESS;
      p.hoverV += (hk * (p.hoverTo - p.hover) - 2 * Math.sqrt(hk) * p.hoverV) * dt;
      p.hover += p.hoverV * dt;
      const settled = !p.drag && !p.turn && Math.abs(p.x - p.target) < 0.05 && Math.abs(p.v) < 0.5
        && Math.abs(p.hover - p.hoverTo) < 0.002 && Math.abs(p.hoverV) < 0.01
        && Math.abs(p.dragY) < 0.05 && Math.abs(p.dragYV) < 0.5;
      if (settled) { p.x = p.target; p.v = 0; p.hover = p.hoverTo; p.hoverV = 0; p.dragY = 0; p.dragYV = 0; }
      else busy = true;
      render(p);
    }
    raf = busy ? requestAnimationFrame(frame) : null;
  }
  function kick() {
    if (raf == null) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  // Hover: any paper under the pointer rises a little; the resume and the
  // letter, once they're on top, show their buttons.
  function setHover(p, on) {
    p.hoverTo = on ? 1 : 0;
    p.el.classList.toggle("is-hovered", on);
    if (!on && p === cloister) hideCaption();
    kick();
  }
  const handle = (node) => node?.closest?.(".sheet-hit, .pill");
  folder.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse" || gesture?.engaged || !handle(e.target)) return;
    const p = paperOf(e.target);
    if (p) setHover(p, true);
  });

  // Lore's cloister photo's caption: a tooltip that fades in just above the
  // pointer once it has rested on the photo (on top of its pile) for a
  // moment, and fades out as soon as the pointer moves on.
  const caption = folder.querySelector(".pill--caption");
  const cloister = byName.get("cathedral");
  let rest = null;              // where the pointer came to rest, and the timer
  function hideCaption() {
    clearTimeout(rest?.timer);
    rest = null;
    caption?.classList.remove("is-shown");
  }
  folder.addEventListener("pointermove", (e) => {
    if (!caption || e.pointerType !== "mouse") return;
    const over = cloister.hoverTo && cloister.el.classList.contains("is-top") && !gesture?.engaged;
    if (over && rest && Math.hypot(e.clientX - rest.x, e.clientY - rest.y) < REST_SLACK) return;
    hideCaption();
    if (!over) return;
    const r = folder.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    rest = {
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => {
        caption.style.setProperty("--tx", `${x.toFixed(1)}px`);
        caption.style.setProperty("--ty", `${y.toFixed(1)}px`);
        caption.classList.add("is-shown");
      }, REST_MS),
    };
  });
  folder.addEventListener("pointerout", (e) => {
    if (e.pointerType !== "mouse" || !handle(e.target)) return;
    const p = paperOf(e.target);
    if (p && !(handle(e.relatedTarget) && paperOf(e.relatedTarget) === p)) setHover(p, false);
  });

  // Dragging and swiping. A drag that starts on the top paper of either pile
  // moves that paper; one that starts anywhere else on the folder picks the
  // paper by direction (leftwards: the top one on the right, rightwards:
  // the top one on the left). Let go past half way, or with a flick, and it
  // carries on over; otherwise it slides back.
  let gesture = null;
  folder.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest(".pill")) return;
    if (scrolled) scrollRelease();
    const p = byEl.get(e.target.closest(".sheet.is-top")?.closest(".sheet"));
    gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, type: e.pointerType, paper: p ?? null, engaged: false, samples: [] };
  });

  function engage(e) {
    const dx = e.clientX - gesture.x0;
    let p = gesture.paper && !gesture.paper.fixed ? gesture.paper : null;
    // A swipe on a touch screen goes by its direction alone (on a phone the
    // left-hand side is off screen): leftwards turns the top paper on the
    // right over, rightwards brings the last one back.
    if (!p || gesture.type !== "mouse") p = dx < 0 ? topRight() : topLeft();
    gesture.engaged = true;
    gesture.paper = p;
    folder.classList.add("is-dragging");
    try { folder.setPointerCapture(e.pointerId); } catch {}
    if (!p) return;
    if (p === topRight()) { onLeft += 1; } else if (p === topLeft()) { onLeft -= 1; }
    // Counted as on its way; let go short and it's put back.
    gesture.from = isLeft(p) ? "left" : "right";
    p.turn = null;               // caught mid-turn: the drag takes over from here
    p.drag = { x0: p.x, px: e.clientX, py: e.clientY };
    p.flight = ++flights;
    p.target = gesture.from === "right" ? p.dx : 0;
    p.dir = gesture.from === "right" ? -1 : 1;
    markTops();
    gesture.paper.el.classList.add("is-top");
  }

  window.addEventListener("pointermove", (e) => {
    if (!gesture || e.pointerId !== gesture.id) return;
    const dx = e.clientX - gesture.x0;
    const dy = e.clientY - gesture.y0;
    if (!gesture.engaged) {
      if (Math.abs(dy) > ENGAGE * 1.5 && Math.abs(dy) > Math.abs(dx)) { gesture = null; return; }
      if (Math.abs(dx) < ENGAGE || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      engage(e);
    }
    const p = gesture.paper;
    if (!p) return;
    e.preventDefault();
    const lo = Math.min(0, p.dx);
    const hi = Math.max(0, p.dx);
    let x = p.drag.x0 + (e.clientX - p.drag.px) / unit;
    if (x < lo) x = lo + (x - lo) * 0.25;
    if (x > hi) x = hi + (x - hi) * 0.25;
    const t = performance.now();
    gesture.samples.push({ t, x });
    while (gesture.samples.length > 2 && t - gesture.samples[0].t > 90) gesture.samples.shift();
    const first = gesture.samples[0];
    p.v = t > first.t ? ((x - first.x) / (t - first.t)) * 1000 : 0;
    p.x = x;
    p.dragY = clamp(((e.clientY - p.drag.py) / unit) * 0.2, -24, 24);
    kick();
  });

  function release(e, cancelled) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const g = gesture;
    gesture = null;
    folder.classList.remove("is-dragging");
    if (!g.engaged) {
      if (cancelled) return;
      // A tap: open the paper's study, or turn the paper tapped; on a touch
      // screen, a tap on the resume or the letter shows its button.
      const p = g.paper;
      if (!p) return;
      if (p.href && (p === topRight() || p === topLeft())) return open(p);
      if (p.fixed) {
        if (g.type !== "mouse") { const on = !p.el.classList.contains("is-revealed"); fixed.forEach((f) => f.el.classList.remove("is-revealed")); p.el.classList.toggle("is-revealed", on); }
        return;
      }
      if (p === topRight()) next();
      else if (p === topLeft()) prev();
      return;
    }
    const p = g.paper;
    if (!p) return;
    p.drag = null;
    const projected = p.x + (cancelled ? 0 : p.v * 0.18);
    const over = p.dx ? projected / p.dx > 0.5 : false;      // past half way to the left
    const wantLeft = over;
    if (wantLeft !== isLeft(p)) {
      // It didn't make it: undo the count taken when the drag began.
      onLeft += wantLeft ? 1 : -1;
    }
    p.target = wantLeft ? p.dx : 0;
    p.dir = wantLeft ? -1 : 1;
    markTops();
    announce();
    kick();
  }
  window.addEventListener("pointerup", (e) => release(e, false));
  window.addEventListener("pointercancel", (e) => release(e, true));
  folder.addEventListener("dragstart", (e) => e.preventDefault());

  // Keys: → turns the top paper over, ← brings the last one back, whenever
  // the folder is on screen (and nothing else wants the keys).
  let inView = false;
  new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; }, { threshold: 0.35 }).observe(folder);
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    if (e.target.closest?.("input, textarea, select, [contenteditable], dialog")) return;
    if (document.querySelector("dialog[open]") || !(inView || folder.contains(document.activeElement))) return;
    e.preventDefault();
    if (e.key === "ArrowRight") next();
    else prev();
  });
  // Enter, on the folder, opens the study on top of the pile on the right.
  folder.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.target !== folder || !topRight()?.href) return;
    e.preventDefault();
    open(topRight());
  });

  // Sideways trackpad swipes over the folder count too.
  let wheel = 0;
  let wheelLock = 0;
  folder.addEventListener("wheel", (e) => {
    if (scrolled || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    const now = performance.now();
    if (now < wheelLock) return;
    wheel += e.deltaX;
    if (Math.abs(wheel) > 60) {
      if (wheel > 0) next();
      else prev();
      wheel = 0;
      wheelLock = now + 450;
    }
  }, { passive: false });

  // Scrolling up and down (a trackpad or a mouse wheel) leafs through too,
  // the way a drag does, while the whole folder is in sight and, on the lore
  // page, the page is at the top; for a folder further down a page (the case
  // studies', data-scroll-leaf="over"), while the pointer is on it instead:
  // down takes the top paper on the right across, up brings the last one
  // back. The paper follows the swipe (js/swipes.js tells swipes
  // apart); when the swipe lets up it carries on over on the spring, at the
  // speed it was going, unless it was pulled back, and the momentum after it
  // is absorbed. A hard swipe only stretches it a little past where it
  // lands, so it stays on the folder.
  //
  // Once the last paper is across, the resume shows its button and scrolling
  // holds there for RESUME_PAUSE; after that, the page scrolls on. The button
  // stays while scrolling; once the mouse moves, it's a hover again, there
  // only while the pointer is on the resume.
  const readSwipe = swipeReader();
  const resume = byName.get("resume");
  let scrolled = null;          // the paper a swipe is moving
  let absorbing = false;        // the momentum of a swipe already used
  let holding = false;          // a swipe held whole: one that came during the pause
  let pauseUntil = -Infinity;
  const leafOver = folder.dataset.scrollLeaf === "over";
  const atRest = (e) => {
    const r = folder.getBoundingClientRect();
    if (r.bottom > window.innerHeight) return false;
    return leafOver ? r.top >= 0 && folder.contains(e.target) : window.scrollY <= 2;
  };

  function scrollGrab(p) {
    const fromRight = p === topRight();
    onLeft += fromRight ? 1 : -1;
    p.turn = null;
    p.drag = { x0: p.x };
    p.flight = ++flights;
    p.target = fromRight ? p.dx : 0;
    p.dir = fromRight ? -1 : 1;
    markTops();
    p.el.classList.add("is-top");
    scrolled = { p, fromRight, by: 0, samples: [], timer: null };
  }

  function scrollMove(dy) {
    const s = scrolled;
    const p = s.p;
    s.by += dy;
    const lo = Math.min(0, p.dx);
    const hi = Math.max(0, p.dx);
    let x = p.drag.x0 - (s.by * SCROLL_DRAG) / unit;
    if (x < lo) x = lo - SCROLL_STRETCH * Math.tanh((lo - x) / SCROLL_STRETCH);
    if (x > hi) x = hi + SCROLL_STRETCH * Math.tanh((x - hi) / SCROLL_STRETCH);
    const t = performance.now();
    s.samples.push({ t, x });
    while (s.samples.length > 2 && t - s.samples[0].t > 90) s.samples.shift();
    const first = s.samples[0];
    p.v = t > first.t ? ((x - first.x) / (t - first.t)) * 1000 : 0;
    p.x = x;
    clearTimeout(s.timer);
    s.timer = setTimeout(scrollRelease, SCROLL_IDLE);
    kick();
  }

  function scrollRelease() {
    const s = scrolled;
    if (!s) return;
    scrolled = null;
    absorbing = true;
    clearTimeout(s.timer);
    const p = s.p;
    p.drag = null;
    // Over unless, with the speed it's going at, it ends up back where it
    // started (or further).
    const start = s.fromRight ? 0 : p.dx;
    const projected = p.x + p.v * 0.18;
    const goes = (projected - start) * Math.sign(p.dx) * (s.fromRight ? 1 : -1) > 0;
    const wantLeft = s.fromRight === goes;
    if (wantLeft !== isLeft(p)) onLeft += wantLeft ? 1 : -1;
    p.target = wantLeft ? p.dx : 0;
    p.dir = wantLeft ? -1 : 1;
    // No faster than four times the way it has left to go, a second, so it
    // lands without flying past.
    p.v = Math.sign(p.v) * Math.min(Math.abs(p.v), 4 * Math.abs(p.target - p.x));
    markTops();
    announce();
    kick();
    if (wantLeft && onLeft === papers.length) {
      pauseUntil = performance.now() + RESUME_PAUSE;
      // Its button shows once the paper is nearly down.
      setTimeout(() => {
        if (onLeft === papers.length) resume.el.classList.add("is-revealed");
      }, 450);
    }
  }

  window.addEventListener("wheel", (e) => {
    const { dy, fresh, starts, ends, swiping } = readSwipe(e);
    if (gesture?.engaged) return;
    if (scrolled) {
      if (e.cancelable) e.preventDefault();
      if (ends) scrollRelease();
      else scrollMove(dy);
      return;
    }
    if (holding && !fresh) {
      if (e.cancelable) e.preventDefault();
      if (ends) holding = false;
      absorbing = true;
      return;
    }
    holding = false;
    if (fresh || starts) absorbing = false;
    if (!e.cancelable || e.ctrlKey || !dy || !atRest(e)) return;
    const p = dy > 0 ? topRight() : topLeft();
    if (p) {
      e.preventDefault();
      if (starts) {
        scrollGrab(p);
        scrollMove(dy);
      }
    } else if (dy > 0 && performance.now() < pauseUntil) {
      e.preventDefault();
      if (starts) holding = true;
    } else if (absorbing && !swiping) {
      e.preventDefault();
    }
  }, { passive: false });

  window.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || !resume.el.classList.contains("is-revealed")) return;
    if (paperOf(handle(e.target)) !== resume) resume.el.classList.remove("is-revealed");
  }, { passive: true });

  folder.addEventListener("focus", () => folder.classList.toggle("is-tabbed", tabbing));
  folder.addEventListener("blur", () => folder.classList.remove("is-tabbed"));

  // Keep pixel sizes in step with the folder's size.
  new ResizeObserver(() => { measure(); for (const p of all) render(p); }).observe(folder);
  canHover.addEventListener("change", () => all.forEach((p) => setHover(p, false)));

  measure();
  markTops();
  announce();
  for (const p of all) render(p);
}
