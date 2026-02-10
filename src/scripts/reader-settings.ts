const STORAGE_KEY = "pg-reader-settings";

interface ReaderSettings {
  theme: "white" | "tan" | "grey" | "black";
  fontFamily: "sans" | "serif" | "dyslexic";
  fontSize: number; // index 0-4
  lineHeight: number; // index 0-2
  contentWidth: "narrow" | "medium" | "wide";
}

const DEFAULTS: ReaderSettings = {
  theme: "white",
  fontFamily: "sans",
  fontSize: 2,
  lineHeight: 1,
  contentWidth: "medium",
};

const FONT_SIZES = ["14px", "16px", "18px", "20px", "22px"];
const LINE_HEIGHTS = ["1.5", "1.7", "2.0"];
const MAX_WIDTHS = { narrow: "55ch", medium: "65ch", wide: "80ch" };
const FONT_FAMILIES = {
  sans: "system-ui, -apple-system, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  dyslexic: "'OpenDyslexic', system-ui, sans-serif",
};

// Migrate old theme names to new ones
const THEME_MIGRATION: Record<string, ReaderSettings["theme"]> = {
  light: "white",
  sepia: "tan",
  dark: "black",
};

export function loadSettings(): ReaderSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = { ...DEFAULTS, ...JSON.parse(stored) };
      if (THEME_MIGRATION[parsed.theme]) {
        parsed.theme = THEME_MIGRATION[parsed.theme];
      }
      return parsed;
    }
  } catch {}
  return { ...DEFAULTS };
}

export function saveSettings(settings: ReaderSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  applySettings(settings);
}

export function applySettings(settings: ReaderSettings): void {
  const root = document.documentElement;

  // Theme — "white" is the :root default, so remove attribute for it
  if (settings.theme === "white") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", settings.theme);
  }

  // Font
  root.style.setProperty("--reader-font-family", FONT_FAMILIES[settings.fontFamily]);
  root.style.setProperty("--reader-font-size", FONT_SIZES[settings.fontSize]);
  root.style.setProperty("--reader-line-height", LINE_HEIGHTS[settings.lineHeight]);
  root.style.setProperty("--reader-max-width", MAX_WIDTHS[settings.contentWidth]);
}

export function cycleTheme(): ReaderSettings {
  const settings = loadSettings();
  const themes: ReaderSettings["theme"][] = ["white", "tan", "grey", "black"];
  const idx = themes.indexOf(settings.theme);
  settings.theme = themes[(idx + 1) % themes.length];
  saveSettings(settings);
  return settings;
}

export function adjustFontSize(delta: number): ReaderSettings {
  const settings = loadSettings();
  settings.fontSize = Math.max(0, Math.min(4, settings.fontSize + delta));
  saveSettings(settings);
  return settings;
}

// Apply settings immediately on script load (prevents FOUC)
export function initSettings(): void {
  const settings = loadSettings();
  applySettings(settings);
}
