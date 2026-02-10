import { navigate } from "astro:transitions/client";

export function initSwipeNavigation(): void {
  let startX = 0;
  let startY = 0;

  document.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener("touchend", (e) => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = endX - startX;
    const diffY = endY - startY;

    // Only trigger if horizontal swipe is dominant and significant
    if (Math.abs(diffX) > 80 && Math.abs(diffX) > Math.abs(diffY) * 2) {
      // Try BaseLayout links first
      const prev = document.getElementById("prev-essay") as HTMLAnchorElement | null;
      const next = document.getElementById("next-essay") as HTMLAnchorElement | null;

      if (diffX > 0) {
        // Swipe right → previous
        if (prev) {
          prev.click();
        } else {
          // ReaderLayout fallback: use data attributes on #essay-content
          const url = document.getElementById("essay-content")?.dataset.prevUrl;
          if (url) {
            document.documentElement.dataset.navDirection = "prev";
            navigate(url);
          }
        }
      } else {
        // Swipe left → next
        if (next) {
          next.click();
        } else {
          const url = document.getElementById("essay-content")?.dataset.nextUrl;
          if (url) {
            document.documentElement.dataset.navDirection = "next";
            navigate(url);
          }
        }
      }
    }
  }, { passive: true });
}
