import { cycleTheme, adjustFontSize } from "./reader-settings";

export function initKeyboardShortcuts(): void {
  document.addEventListener("keydown", (e) => {
    // Don't trigger in inputs
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    switch (e.key) {
      case "d":
        cycleTheme();
        break;
      case "+":
      case "=":
        e.preventDefault();
        adjustFontSize(1);
        break;
      case "-":
        e.preventDefault();
        adjustFontSize(-1);
        break;
      case "s":
        e.preventDefault();
        document.getElementById("search-input")?.focus();
        break;
      case "t":
        // Toggle TOC sidebar (if on essay page)
        break;
      case "?":
        e.preventDefault();
        const overlay = document.getElementById("shortcuts-overlay");
        overlay?.classList.toggle("hidden");
        break;
      case "j":
        window.scrollBy({ top: 100, behavior: "smooth" });
        break;
      case "k":
        window.scrollBy({ top: -100, behavior: "smooth" });
        break;
      case "Escape":
        // Close any open panel
        document.getElementById("reader-controls")?.classList.add("hidden");
        document.getElementById("shortcuts-overlay")?.classList.add("hidden");
        break;
    }
  });
}
