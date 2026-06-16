// True on phones/tablets, where there's no real browser chrome (tabs, back
// button) — e.g. iOS PWA standalone, where a target=_blank PDF/image opens
// fullscreen with no way back. Callers use this to choose an in-app modal
// (mobile) vs. just opening the file in a new tab (desktop).
export const isMobileDevice = () =>
  typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Open a URL in a new tab the way a real <a target="_blank"> click would.
// Synthesising the anchor click (rather than window.open(url, "_blank",
// "noreferrer")) keeps it inside the user gesture so popup blockers — Safari
// in particular treats window.open with a features string as a blockable
// popup — don't swallow it.
export const openInNewTab = (url: string) => {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
};
