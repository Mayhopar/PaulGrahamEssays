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
      if (diffX > 0) {
        // Swipe right → previous
        const prev = document.getElementById("prev-essay") as HTMLAnchorElement | null;
        prev?.click();
      } else {
        // Swipe left → next
        const next = document.getElementById("next-essay") as HTMLAnchorElement | null;
        next?.click();
      }
    }
  }, { passive: true });
}
