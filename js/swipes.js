// Reads swipes out of wheel events, from a trackpad or a mouse wheel, up and
// down. A swipe starts when the events pick up speed (after a pause, or well
// above where a trackpad's momentum had died down to) and lasts until they
// clearly slow down again; what follows is momentum, until the next swipe.
// Speed is taken per 16 ms, so it reads the same whether the events come 60
// or 120 times a second, or two arrive as one.
//
// When the page is busy (a long task, say while the booking calendar loads),
// wheel events wait and then arrive merged, late, as if after a pause. A
// ticker that runs once a frame while the wheel is in use tells the two
// apart: through a real pause it keeps ticking, through a stall it can't.
export const GESTURE_GAP = 200;   // ms without wheel events that ends a gesture
const STALL = 50;                 // ms without a tick that means the page was stuck

let lastTick = 0;
let tickUntil = 0;
let ticking = false;
function tick(now) {
  lastTick = now;
  ticking = now < tickUntil;
  if (ticking) requestAnimationFrame(tick);
}
function keepTicking(now) {
  tickUntil = now + 1000;
  if (!ticking) {
    ticking = true;
    lastTick = now;
    requestAnimationFrame(tick);
  }
}

export function swipeReader() {
  let recent = [];      // the last two wheel events: how far, over how long
  let last = -Infinity;
  let swiping = false;
  let peak = 0;         // fastest so far in this swipe
  let trough = 0;       // slowest since the last swipe ended

  // For each wheel event: how far it scrolls (dy, px), whether it's the first
  // after a pause (fresh), whether a swipe starts or ends with it, and
  // whether one is under way.
  return (e) => {
    const dy = e.deltaY * [1, 16, window.innerHeight][e.deltaMode];
    const since = e.timeStamp - last;
    const now = performance.now();
    const stalled = ticking && now - lastTick > STALL;
    keepTicking(now);
    const fresh = since > GESTURE_GAP && !stalled;
    if (fresh) {
      recent = [];
      swiping = false;
      trough = 0;
    }
    last = e.timeStamp;
    // Speed is distance over time across the last two events, so an uneven
    // pair (a merged one, then one straight after) still reads true. After a
    // stall the time apart counts in full; otherwise it's held to 64 ms, so
    // the uneven clicks of a mouse wheel read as one steady turn.
    const span = fresh ? 16 : stalled ? since : Math.min(since, 64);
    recent = [...recent.slice(-1), { distance: Math.abs(dy), span }];
    const speed = (recent.reduce((sum, r) => sum + r.distance, 0) * 16)
      / Math.max(4, recent.reduce((sum, r) => sum + r.span, 0));
    let starts = false;
    let ends = false;
    if (!swiping && speed >= 2 && speed > trough * 1.5 + 1) {
      swiping = starts = true;
      peak = speed;
    } else if (swiping) {
      peak = Math.max(peak, speed);
      if (speed < peak * 0.6) {
        swiping = false;
        ends = true;
        trough = speed;
      }
    } else {
      trough = Math.min(trough, speed);
    }
    return { dy, fresh, starts, ends, swiping };
  };
}
