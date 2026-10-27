// A case study in a panel that slides in from the right, over the page
// (preview.html, for now): a link with data-panel="<dialog id>" opens it
// instead of going to the study's page, which loads inside it once someone
// heads for the link. The ×, Esc, a click on the dimmed page, the study's
// own ← and the browser's back button all close it, sliding it back out
// first. The address gets the study's name while it's open (#on-my-disk),
// so a link to that opens it too.
export function initPanels() {
  for (const link of document.querySelectorAll("[data-panel]")) {
    const dialog = document.getElementById(link.dataset.panel);
    if (dialog) initPanel(link, dialog);
  }
}

function initPanel(link, dialog) {
  const frame = dialog.querySelector("iframe");
  const hash = `#${new URL(link.href).pathname.split("/").pop().replace(/\.html$/, "")}`;
  let pushed = false;   // whether opening it added a step to the history

  const load = () => { if (!frame.getAttribute("src")) frame.src = frame.dataset.src; };
  link.addEventListener("pointerenter", load);
  link.addEventListener("focus", load);
  link.addEventListener("touchstart", load, { passive: true });

  function open(push) {
    if (dialog.open) return;
    load();
    dialog.showModal();
    frame.focus();   // keys scroll the study, not the page under it
    if (push) {
      history.pushState({ panel: dialog.id }, "", hash);
      pushed = true;
    }
  }

  function slideOut() {
    if (!dialog.open || dialog.classList.contains("is-closing")) return;
    dialog.classList.add("is-closing");
    const done = () => {
      clearTimeout(fallback);
      dialog.removeEventListener("animationend", onEnd);
      dialog.classList.remove("is-closing");
      dialog.close();
    };
    const onEnd = (e) => { if (e.animationName === "study-panel-out") done(); };
    const fallback = setTimeout(done, 1000);
    dialog.addEventListener("animationend", onEnd);
  }

  // Back out of the step opening it added (that closes it, below), or, if it
  // opened from a link to it, just close it and drop its name.
  function close() {
    if (!dialog.open) return;
    if (pushed) return history.back();
    slideOut();
    if (location.hash === hash) history.replaceState(history.state, "", location.pathname + location.search);
  }

  window.addEventListener("popstate", () => {
    if (location.hash === hash) return open(false);
    pushed = false;
    slideOut();
  });

  link.addEventListener("click", (e) => {
    e.preventDefault();
    open(true);
  });
  dialog.querySelector(".study-panel-close").addEventListener("click", close);
  dialog.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  window.addEventListener("message", (e) => {
    if (e.source === frame.contentWindow && e.data === "close-study") close();
  });

  // A click that starts and ends on the dimmed page closes it.
  const onBackdrop = (e) => {
    const r = dialog.getBoundingClientRect();
    return e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
  };
  let pressedBackdrop = false;
  dialog.addEventListener("pointerdown", (e) => { pressedBackdrop = onBackdrop(e); });
  dialog.addEventListener("click", (e) => { if (pressedBackdrop && onBackdrop(e)) close(); });

  // The page under it stays put: scrolling over the dimmed page (or the ×)
  // neither moves it nor steps through the work. (Scrolling the study stays
  // inside its frame.)
  const hold = (e) => { e.preventDefault(); e.stopPropagation(); };
  dialog.addEventListener("wheel", hold, { passive: false });
  dialog.addEventListener("touchmove", hold, { passive: false });

  if (location.hash === hash) open(false);
}
