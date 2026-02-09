const HISTORY_KEY = "pg-reading-history";

interface ReadingRecord {
  read: boolean;
  scrollPosition: number;
  lastReadAt: string;
  wordCount: number;
}

type ReadingHistory = Record<string, ReadingRecord>;

export function getHistory(): ReadingHistory {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveHistory(history: ReadingHistory): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function markAsRead(slug: string, wordCount: number): void {
  const history = getHistory();
  history[slug] = {
    ...history[slug],
    read: true,
    lastReadAt: new Date().toISOString(),
    wordCount,
  };
  saveHistory(history);
}

export function saveScrollPosition(slug: string, position: number): void {
  const history = getHistory();
  history[slug] = {
    ...history[slug],
    scrollPosition: position,
    read: history[slug]?.read || false,
    lastReadAt: history[slug]?.lastReadAt || new Date().toISOString(),
    wordCount: history[slug]?.wordCount || 0,
  };
  saveHistory(history);
}

export function getScrollPosition(slug: string): number {
  return getHistory()[slug]?.scrollPosition || 0;
}

export function isRead(slug: string): boolean {
  return getHistory()[slug]?.read || false;
}

export function getStats(): { essaysRead: number; wordsRead: number } {
  const history = getHistory();
  let essaysRead = 0;
  let wordsRead = 0;
  for (const record of Object.values(history)) {
    if (record.read) {
      essaysRead++;
      wordsRead += record.wordCount || 0;
    }
  }
  return { essaysRead, wordsRead };
}

export function initReadIndicators(): void {
  const history = getHistory();
  document.querySelectorAll("[data-essay-slug]").forEach((el) => {
    const slug = (el as HTMLElement).dataset.essaySlug!;
    if (history[slug]?.read) {
      el.querySelector(".read-check")?.classList.remove("hidden");
    }
  });
}

export function initScrollTracking(slug: string, wordCount: number): void {
  // Restore scroll position
  const saved = getScrollPosition(slug);
  if (saved > 0) {
    setTimeout(() => window.scrollTo(0, saved), 100);
  }

  // Track scroll position
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(() => {
        saveScrollPosition(slug, window.scrollY);

        // Mark as read at 90% scroll
        const scrollPercent = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
        if (scrollPercent > 0.9) {
          markAsRead(slug, wordCount);
        }
        ticking = false;
      });
    }
  }, { passive: true });
}
