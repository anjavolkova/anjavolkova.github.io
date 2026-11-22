// Trace: a daily word game. Swipe (or tap, or type) through touching letters
// on a 4×4 board to spell words of 4+ letters, each tile once per word.
// Common words (assets/words/common.txt) are the puzzle; rarer ones
// (bonus.txt) count as bonus words.
//
// Each day's board is generated here, in the browser, from the date: the
// same seed gives everyone the same board. Progress is kept in
// localStorage, per day.

const SIZE = 4;
const MIN_LEN = 4;
const HINTS = 3;
const LAUNCH = new Date(2026, 10, 21); // puzzle #1 (months count from 0)

// ---------- Seeded randomness ----------

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Dates ----------

function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function puzzleNumber(d = new Date()) {
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(LAUNCH.getFullYear(), LAUNCH.getMonth(), LAUNCH.getDate());
  return Math.round((a - b) / 86400000) + 1;
}

// ---------- Words ----------

async function loadList(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Couldn't load ${path}`);
  return (await res.text()).split("\n").filter(Boolean);
}

function buildDictionary(common, bonus) {
  const all = new Set([...common, ...bonus]);
  const prefixes = new Set();
  for (const w of all) for (let i = 1; i < w.length; i++) prefixes.add(w.slice(0, i));
  return { common: new Set(common), all, prefixes };
}

// ---------- Boards ----------

// Rough English letter frequencies (per 1000), Q left out (a lone Q spells
// almost nothing).
const CONSONANTS = { b: 15, c: 28, d: 43, f: 22, g: 20, h: 45, j: 2, k: 8, l: 40, m: 24, n: 67, p: 19, r: 60, s: 63, t: 91, v: 10, w: 20, x: 2, y: 20, z: 1 };
const VOWELS = { a: 82, e: 127, i: 70, o: 75, u: 28 };

function pick(weights, rand) {
  const entries = Object.entries(weights);
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = rand() * total;
  for (const [ch, w] of entries) if ((r -= w) < 0) return ch;
  return entries[entries.length - 1][0];
}

function randomBoard(rand) {
  const vowels = 5 + Math.floor(rand() * 3); // 5–7 of 16
  const letters = [];
  for (let i = 0; i < SIZE * SIZE; i++) letters.push(pick(i < vowels ? VOWELS : CONSONANTS, rand));
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  return letters;
}

function neighbours(i) {
  const x = i % SIZE, y = Math.floor(i / SIZE), out = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE) out.push(ny * SIZE + nx);
    }
  return out;
}
const NEIGHBOURS = Array.from({ length: SIZE * SIZE }, (_, i) => neighbours(i));

// Every dictionary word the board holds.
function solve(board, dict) {
  const found = new Set();
  const used = new Array(board.length).fill(false);
  const walk = (i, word) => {
    word += board[i];
    if (word.length >= MIN_LEN && dict.all.has(word)) found.add(word);
    if (!dict.prefixes.has(word)) return;
    used[i] = true;
    for (const n of NEIGHBOURS[i]) if (!used[n]) walk(n, word);
    used[i] = false;
  };
  for (let i = 0; i < board.length; i++) walk(i, "");
  return found;
}

// A board worth playing: enough common words, but not a flood, and at least
// one long one to hunt for.
function makePuzzle(seedText, dict) {
  const rand = rng(hashString(seedText));
  let best = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const board = randomBoard(rand);
    const words = solve(board, dict);
    const common = [...words].filter((w) => dict.common.has(w));
    const longest = common.reduce((m, w) => Math.max(m, w.length), 0);
    const score = (common.length >= 25 && common.length <= 60 ? 100 : 0) + (longest >= 7 ? 50 : longest * 5) - Math.abs(40 - common.length);
    if (!best || score > best.score) best = { board, words, common, score };
    if (common.length >= 25 && common.length <= 60 && longest >= 7) break;
  }
  const required = best.common.sort();
  const bonus = [...best.words].filter((w) => !dict.common.has(w)).sort();
  return { board: best.board, required, bonus };
}

// The tiles that spell a word, if any path does (for typed input), starting
// at tile `start` if given.
function findPath(board, word, start) {
  const path = [];
  const walk = (i, k) => {
    if (board[i] !== word[k] || path.includes(i)) return false;
    path.push(i);
    if (k === word.length - 1) return true;
    for (const n of NEIGHBOURS[i]) if (walk(n, k + 1)) return true;
    path.pop();
    return false;
  };
  if (start !== undefined) return walk(start, 0) ? path : null;
  for (let i = 0; i < board.length; i++) if (walk(i, 0)) return path;
  return null;
}

// ---------- Saved progress ----------

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || null;
  } catch {
    return null;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or storage off: play on without saving */
  }
}

// ---------- The game ----------

const $ = (sel) => document.querySelector(sel);

async function main() {
  const root = $("[data-trace]");
  const els = {
    number: $("[data-trace-number]"),
    progress: $("[data-trace-progress]"),
    bar: $("[data-trace-bar]"),
    board: $("[data-trace-board]"),
    line: $("[data-trace-line]"),
    word: $("[data-trace-word]"),
    message: $("[data-trace-message]"),
    rotate: $("[data-trace-rotate]"),
    hint: $("[data-trace-hint]"),
    hintsLeft: $("[data-trace-hints-left]"),
    hintText: $("[data-trace-hint-text]"),
    share: $("[data-trace-share]"),
    found: $("[data-trace-found]"),
    bonus: $("[data-trace-bonus]"),
    bonusCount: $("[data-trace-bonus-count]"),
  };

  let dict;
  try {
    const [common, bonus] = await Promise.all([loadList("assets/words/common.txt"), loadList("assets/words/bonus.txt")]);
    dict = buildDictionary(common, bonus);
  } catch (err) {
    els.message.textContent = "The word list didn’t load. Try reloading the page.";
    root.dataset.state = "error";
    return;
  }

  const day = todayKey();
  const number = puzzleNumber();
  const puzzle = makePuzzle(`trace-${day}`, dict);
  const storeKey = `trace:${day}`;
  const state = Object.assign({ found: [], bonus: [], hints: HINTS, hinted: [], turns: 0 }, load(storeKey));
  // Keep only words this board has (if the word lists change, a day's board
  // can too).
  state.found = state.found.filter((w) => puzzle.required.includes(w));
  state.bonus = state.bonus.filter((w) => puzzle.bonus.includes(w));
  state.hinted = state.hinted.filter((w) => puzzle.required.includes(w));
  const persist = () => save(storeKey, state);

  els.number.textContent = `#${number}`;

  // Tiles
  const tiles = puzzle.board.map((letter, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "trace-tile";
    b.dataset.index = i;
    b.innerHTML = `<span class="trace-letter">${letter.toUpperCase()}</span><span class="trace-count" hidden></span>`;
    els.board.appendChild(b);
    return b;
  });

  // Words left: once a third of the words are found, each tile shows how
  // many words still to find start on it.
  const COUNTS_AT = Math.ceil(puzzle.required.length / 3);
  const startsAt = puzzle.board.map((_, i) => puzzle.required.filter((w) => findPath(puzzle.board, w, i)));
  function showCounts() {
    const on = state.found.length >= COUNTS_AT && state.found.length < puzzle.required.length;
    tiles.forEach((t, i) => {
      const count = t.querySelector(".trace-count");
      const left = startsAt[i].filter((w) => !state.found.includes(w)).length;
      count.hidden = !on;
      count.textContent = left;
      count.classList.toggle("is-zero", left === 0);
      t.dataset.left = on ? `, ${left} ${left === 1 ? "word" : "words"} left` : "";
    });
  }

  // Rotation: each tile keeps its index (so the puzzle and the words don't
  // change) and moves to where a quarter turn clockwise puts it, as many
  // turns as state.turns. Tiles that touched still touch.
  function placeTiles() {
    tiles.forEach((t, i) => {
      let x = i % SIZE, y = Math.floor(i / SIZE);
      for (let k = 0; k < state.turns % 4; k++) [x, y] = [SIZE - 1 - y, x];
      t.style.gridColumn = x + 1;
      t.style.gridRow = y + 1;
      t.setAttribute("aria-label", `${puzzle.board[i].toUpperCase()}, row ${y + 1}, column ${x + 1}${t.dataset.left || ""}`);
    });
  }
  placeTiles();

  // ----- Current path -----
  let path = [];
  let typed = "";

  function centre(i) {
    const box = els.board.getBoundingClientRect();
    const t = tiles[i].getBoundingClientRect();
    return [t.left - box.left + t.width / 2, t.top - box.top + t.height / 2];
  }

  function drawPath() {
    tiles.forEach((t, i) => t.classList.toggle("is-selected", path.includes(i)));
    els.line.setAttribute("points", path.map((i) => centre(i).join(",")).join(" "));
    const word = path.map((i) => puzzle.board[i]).join("");
    els.word.textContent = (typed || word).toUpperCase();
  }

  function clearPath() {
    path = [];
    typed = "";
    drawPath();
  }

  let messageTimer;
  function say(text, kind = "") {
    els.message.textContent = text;
    els.message.dataset.kind = kind;
    clearTimeout(messageTimer);
    if (text) messageTimer = setTimeout(() => (els.message.textContent = ""), 2200);
  }

  function flash(kind) {
    root.dataset.flash = kind;
    setTimeout(() => delete root.dataset.flash, 450);
  }

  function submit(word) {
    if (!word) return;
    if (word.length < MIN_LEN) {
      say("Too short", "bad");
      flash("bad");
    } else if (state.found.includes(word) || state.bonus.includes(word)) {
      say("Already found", "same");
      flash("same");
    } else if (puzzle.required.includes(word)) {
      state.found.push(word);
      persist();
      say(`+${word.length}`, "good");
      flash("good");
      render();
      if (state.found.length === puzzle.required.length) say("You found every word!", "win");
      else if (state.found.length === COUNTS_AT) say("Words left now show on each tile", "good");
    } else if (puzzle.bonus.includes(word)) {
      state.bonus.push(word);
      persist();
      say("Bonus word", "bonus");
      flash("bonus");
      render();
    } else {
      say("Not in the list", "bad");
      flash("bad");
    }
  }

  // ----- Pointer: swipe through tiles, or tap them one by one -----
  // A swipe submits when you lift your finger. A tap on a single tile starts
  // tap mode: tap touching tiles to add them, the last one again to submit.
  let dragging = false;
  let moved = false;

  function tileAt(x, y) {
    // Only count the middle of a tile, so diagonals are easy to cut across.
    for (let i = 0; i < tiles.length; i++) {
      const r = tiles[i].getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (Math.hypot(x - cx, y - cy) < r.width * 0.42) return i;
    }
    return -1;
  }

  function extend(i) {
    if (i < 0) return;
    const last = path[path.length - 1];
    if (i === last) return;
    if (path.length > 1 && i === path[path.length - 2]) {
      path.pop(); // slid back: undo
    } else if (!path.includes(i) && (last === undefined || NEIGHBOURS[last].includes(i))) {
      path.push(i);
    } else return;
    moved = true;
    drawPath();
  }

  els.board.addEventListener("pointerdown", (e) => {
    const i = tileAt(e.clientX, e.clientY);
    if (i < 0) return;
    e.preventDefault();
    typed = "";
    const last = path[path.length - 1];
    if (path.length && i === last) {
      // Tap mode: the last tile again submits.
      const word = path.map((j) => puzzle.board[j]).join("");
      clearPath();
      submit(word);
      return;
    }
    if (!(path.length && NEIGHBOURS[last].includes(i) && !path.includes(i))) path = [];
    path.push(i);
    dragging = true;
    moved = false;
    els.board.setPointerCapture(e.pointerId);
    drawPath();
  });

  els.board.addEventListener("pointermove", (e) => {
    if (dragging) extend(tileAt(e.clientX, e.clientY));
  });

  const end = () => {
    if (!dragging) return;
    dragging = false;
    if (moved && path.length > 1) {
      const word = path.map((j) => puzzle.board[j]).join("");
      clearPath();
      submit(word);
    }
  };
  els.board.addEventListener("pointerup", end);
  els.board.addEventListener("pointercancel", () => {
    dragging = false;
    clearPath();
  });

  // ----- Keyboard: type a word, Enter to submit -----
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest("input, textarea")) return;
    if (/^[a-z]$/i.test(e.key)) {
      typed += e.key.toLowerCase();
      path = findPath(puzzle.board, typed) || [];
      drawPath();
    } else if (e.key === "Backspace") {
      typed = typed.slice(0, -1);
      path = typed ? findPath(puzzle.board, typed) || [] : [];
      drawPath();
    } else if (e.key === "Enter" && (typed || path.length)) {
      e.preventDefault();
      const word = typed || path.map((j) => puzzle.board[j]).join("");
      const onBoard = !typed || path.length;
      clearPath();
      if (onBoard) submit(word);
      else {
        say("Not on the board", "bad");
        flash("bad");
      }
    } else if (e.key === "Escape") clearPath();
  });

  // ----- Rotate: a quarter turn clockwise -----
  els.rotate.addEventListener("click", () => {
    clearPath();
    state.turns = (state.turns + 1) % 4;
    persist();
    placeTiles();
    els.board.classList.remove("is-turning");
    void els.board.offsetWidth; // restart the animation on quick repeat taps
    els.board.classList.add("is-turning");
  });
  els.board.addEventListener("animationend", () => els.board.classList.remove("is-turning"));

  // ----- Hints: the first two letters and length of a word not yet found -----
  els.hint.addEventListener("click", () => {
    if (state.hints <= 0) return;
    const left = puzzle.required.filter((w) => !state.found.includes(w) && !state.hinted.includes(w));
    if (!left.length) return;
    const word = left[Math.floor(Math.random() * left.length)];
    state.hints--;
    state.hinted.push(word);
    persist();
    render();
    // Point at it on the board: the tile it starts on pulses.
    const start = findPath(puzzle.board, word)[0];
    tiles[start].classList.remove("is-hint");
    void tiles[start].offsetWidth;
    tiles[start].classList.add("is-hint");
    tiles[start].addEventListener("animationend", () => tiles[start].classList.remove("is-hint"), { once: true });
  });

  // ----- Share -----
  els.share.addEventListener("click", async () => {
    const text = `Trace #${number}: ${state.found.length}/${puzzle.required.length} words` + (state.bonus.length ? `, ${state.bonus.length} bonus` : "") + `\n${location.origin}${location.pathname}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        say("Copied to clipboard");
      }
    } catch {
      /* share sheet closed */
    }
  });

  // ----- Word lists -----
  function render() {
    const total = puzzle.required.length;
    els.progress.textContent = `${state.found.length} of ${total} words`;
    els.bar.style.setProperty("--progress", state.found.length / total);
    els.hintsLeft.textContent = state.hints;
    els.hint.disabled = state.hints <= 0 || state.found.length === total;

    // Hints still open (hinted, not yet found), under the board.
    const open = state.hinted.filter((w) => !state.found.includes(w));
    els.hintText.hidden = !open.length;
    els.hintText.innerHTML = open.length
      ? `${open.length > 1 ? "Hints" : "Hint"}: ` +
        open.map((w) => `<strong>${w.slice(0, 2).toUpperCase()}${"·".repeat(w.length - 2)}</strong> <span>${w.length} letters</span>`).join(", ")
      : "";
    root.dataset.state = state.found.length === total ? "won" : "playing";
    showCounts();
    placeTiles(); // refreshes the tiles' labels with their counts

    // Grouped by length: found words shown, the rest as blanks (a hinted
    // word shows its first two letters).
    els.found.innerHTML = "";
    const lengths = [...new Set(puzzle.required.map((w) => w.length))].sort((a, b) => a - b);
    for (const len of lengths) {
      const group = document.createElement("section");
      group.className = "trace-group";
      const words = puzzle.required.filter((w) => w.length === len);
      const got = words.filter((w) => state.found.includes(w));
      group.innerHTML = `<h3 class="trace-group-title">${len} letters <span>${got.length}/${words.length}</span></h3>`;
      const list = document.createElement("ul");
      list.className = "trace-words";
      for (const w of words) {
        const li = document.createElement("li");
        if (state.found.includes(w)) {
          li.className = "is-found";
          li.textContent = w;
        } else if (state.hinted.includes(w)) {
          li.className = "is-hinted";
          li.textContent = w.slice(0, 2) + "·".repeat(w.length - 2);
        } else {
          li.className = "is-hidden";
          li.textContent = "·".repeat(w.length);
          li.setAttribute("aria-label", `${w.length}-letter word, not found yet`);
        }
        list.appendChild(li);
      }
      group.appendChild(list);
      els.found.appendChild(group);
    }

    els.bonusCount.textContent = `${state.bonus.length}`;
    els.bonus.innerHTML = state.bonus.map((w) => `<li>${w}</li>`).join("");
  }

  window.addEventListener("resize", drawPath);
  render();
  drawPath();
  root.dataset.ready = "";
}

main();
