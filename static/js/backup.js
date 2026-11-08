// The 💾 backup button (laptops only, see style.css): it shows once the page
// is scrolled to the bottom, or when there's nothing to scroll.

const NEAR_BOTTOM = 40; // px

function sync() {
  const page = document.documentElement;
  const atBottom = window.innerHeight + window.scrollY >= page.scrollHeight - NEAR_BOTTOM;
  document.getElementById("backup-fab").classList.toggle("shown", atBottom);
}

export function initBackupButton() {
  window.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync);
  // The page grows and shrinks as views change and the catalog loads.
  new ResizeObserver(sync).observe(document.body);
  sync();
}
