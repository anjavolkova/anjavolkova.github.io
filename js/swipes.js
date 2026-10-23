// Reads swipes out of wheel events, from a trackpad or a mouse wheel, up and
// down. A swipe starts when the events pick up speed (after a pause, or well
// above where a trackpad's momentum had died down to) and lasts until they
// clearly slow down again; what follows is momentum, until the next swipe.
// Speed is taken per 16 ms, so it reads the same whether the events come 60
// or 120 times a second, or two arrive as one.
export const GESTURE_GAP = 200;   // ms without wheel events that ends a gesture

export function swipeReader() {
  let speeds = [];      // how fast the last two wheel events went
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
    const fresh = since > GESTURE_GAP;
    if (fresh) {
      speeds = [];
      swiping = false;
      trough = 0;
    }
    last = e.timeStamp;
    const per16 = fresh ? 1 : 16 / Math.min(Math.max(since, 8), 64);
    speeds = [...speeds.slice(-1), Math.abs(dy) * per16];
    const speed = speeds.reduce((sum, v) => sum + v, 0) / speeds.length;
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
