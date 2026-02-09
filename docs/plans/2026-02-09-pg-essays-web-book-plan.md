# Paul Graham Essays Web Book — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a static Astro.js website that collects all ~200+ Paul Graham essays into a beautifully typeset web book with premium reading features, auto-synced daily.

**Architecture:** Astro.js static site using Content Collections (glob loader) for Markdown essays. A Python scraper fetches and converts essays from paulgraham.com. GitHub Actions runs the scraper daily and deploys to GitHub Pages. All reader state (settings, history, annotations) lives in localStorage.

**Tech Stack:** Astro.js 5+, Tailwind CSS v4 (Vite plugin), vanilla TypeScript, Python 3 (requests, beautifulsoup4, markdownify, htmldate), Pagefind (static search), GitHub Actions, GitHub Pages.

**Design doc:** `docs/plans/2026-02-09-pg-essays-web-book-design.md`

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `src/styles/global.css`
- Create: `src/content.config.ts`
- Create: `src/pages/index.astro` (placeholder)
- Create: `.gitignore`

**Step 1: Initialize Astro project**

Run:
```bash
npm create astro@latest . -- --template minimal --install --no-git
```
Expected: Astro project scaffolded in current directory.

**Step 2: Install Tailwind CSS v4**

Run:
```bash
npm install tailwindcss @tailwindcss/vite
```
Expected: Packages added to package.json.

**Step 3: Configure astro.config.mjs**

```javascript
// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://<username>.github.io",
  base: "/PG",
  vite: {
    plugins: [tailwindcss()],
  },
});
```

Note: Replace `<username>` with the actual GitHub username before deploying.

**Step 4: Create global CSS**

Create `src/styles/global.css`:
```css
@import "tailwindcss";
```

**Step 5: Create content collection config**

Create `src/content.config.ts`:
```typescript
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const essays = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/essays" }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    dateISO: z.string(),
    slug: z.string(),
    sourceUrl: z.string(),
    wordCount: z.number(),
    readingTime: z.number(),
  }),
});

export const collections = { essays };
```

**Step 6: Create placeholder index page**

Create `src/pages/index.astro`:
```astro
---
import "../styles/global.css";
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Paul Graham Essays</title>
  </head>
  <body class="bg-white text-gray-900">
    <h1 class="text-3xl font-bold p-8">Paul Graham Essays</h1>
    <p class="px-8">Coming soon.</p>
  </body>
</html>
```

**Step 7: Create .gitignore**

```
node_modules/
dist/
.astro/
.DS_Store
__pycache__/
*.pyc
public/pagefind/
```

**Step 8: Verify the build works**

Run:
```bash
npm run dev
```
Expected: Dev server starts, page renders at localhost:4321 with "Paul Graham Essays" heading.

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Astro project with Tailwind CSS v4 and content collection"
```

---

## Task 2: Essay Scraper Script

**Files:**
- Create: `scripts/sync-essays.py`
- Create: `scripts/requirements.txt`
- Create: `src/content/essays/` (directory, populated by scraper)

**Step 1: Create requirements.txt**

Create `scripts/requirements.txt`:
```
requests>=2.31.0
beautifulsoup4>=4.12.0
markdownify>=0.13.0
htmldate>=1.9.0
python-slugify>=8.0.0
```

**Step 2: Write the scraper**

Create `scripts/sync-essays.py`:
```python
#!/usr/bin/env python3
"""
Scrapes Paul Graham's essays from paulgraham.com and converts them
to Markdown files with frontmatter for Astro content collections.
"""

import os
import re
import time
import math
import requests
from bs4 import BeautifulSoup
from markdownify import markdownify as md
from htmldate import find_date
from slugify import slugify

ESSAYS_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "content", "essays")
BASE_URL = "https://paulgraham.com"
ARTICLES_URL = f"{BASE_URL}/articles.html"
WORDS_PER_MINUTE = 230


def get_existing_slugs():
    """Return set of slugs already scraped (filename without .md)."""
    if not os.path.exists(ESSAYS_DIR):
        os.makedirs(ESSAYS_DIR, exist_ok=True)
        return set()
    return {f.replace(".md", "") for f in os.listdir(ESSAYS_DIR) if f.endswith(".md")}


def get_essay_links():
    """Fetch articles.html and extract all essay links."""
    resp = requests.get(ARTICLES_URL, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    links = []
    for a in soup.find_all("a"):
        href = a.get("href", "")
        title = a.get_text(strip=True)
        # Only internal essay links (not external, not anchors)
        if (
            title
            and href
            and not href.startswith("http")
            and not href.startswith("#")
            and href.endswith(".html")
            and href != "articles.html"
        ):
            links.append({"title": title, "href": href})
    return links


def scrape_essay(href):
    """Fetch a single essay page, extract content and metadata."""
    url = f"{BASE_URL}/{href}"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    html = resp.text
    soup = BeautifulSoup(html, "html.parser")

    # Try to find the date from the page
    date_str = ""
    date_iso = ""

    # PG essays often have the date as text like "January 2023"
    # near the top of the page, inside a <font> tag or as plain text
    date_found = find_date(html)
    if date_found:
        date_iso = date_found[:7]  # "YYYY-MM"
        # Convert ISO to readable: "2023-01" -> "January 2023"
        try:
            from datetime import datetime
            dt = datetime.strptime(date_found, "%Y-%m-%d")
            date_str = dt.strftime("%B %Y")
        except (ValueError, TypeError):
            date_str = date_found

    # Extract the essay body
    # PG's essays use <table> layout. The main content is typically
    # in a <font> tag within the main table, or in the body text.
    # We'll extract the main content area.
    body = soup.find("body")
    if not body:
        return None

    # Remove script tags, style tags, and img tags
    for tag in body.find_all(["script", "style"]):
        tag.decompose()

    # Convert to markdown
    content = md(str(body), heading_style="ATX", strip=["img"])

    # Clean up excessive whitespace
    content = re.sub(r"\n{3,}", "\n\n", content)
    content = content.strip()

    # Word count and reading time
    words = len(content.split())
    reading_time = max(1, math.ceil(words / WORDS_PER_MINUTE))

    return {
        "content": content,
        "date": date_str,
        "dateISO": date_iso,
        "sourceUrl": url,
        "wordCount": words,
        "readingTime": reading_time,
    }


def write_essay(slug, title, data):
    """Write essay as Markdown file with YAML frontmatter."""
    frontmatter = f"""---
title: "{title.replace('"', '\\"')}"
date: "{data['date']}"
dateISO: "{data['dateISO']}"
slug: "{slug}"
sourceUrl: "{data['sourceUrl']}"
wordCount: {data['wordCount']}
readingTime: {data['readingTime']}
---"""

    filepath = os.path.join(ESSAYS_DIR, f"{slug}.md")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(frontmatter + "\n\n" + data["content"])
    return filepath


def main():
    print("Fetching essay list...")
    links = get_essay_links()
    print(f"Found {len(links)} essays on articles page.")

    existing = get_existing_slugs()
    print(f"Already have {len(existing)} essays locally.")

    new_count = 0
    for link in links:
        slug = slugify(link["title"], max_length=80)
        if slug in existing:
            continue

        print(f"  Scraping: {link['title']}...")
        try:
            data = scrape_essay(link["href"])
            if data and data["content"]:
                write_essay(slug, link["title"], data)
                new_count += 1
                print(f"    -> Saved as {slug}.md")
            else:
                print(f"    -> Skipped (no content)")
        except Exception as e:
            print(f"    -> Error: {e}")

        time.sleep(1)  # Be respectful

    print(f"\nDone. Added {new_count} new essays.")
    return new_count


if __name__ == "__main__":
    main()
```

**Step 3: Create the essays directory**

Run:
```bash
mkdir -p src/content/essays
```

**Step 4: Install Python dependencies and test the scraper on a single essay**

Run:
```bash
pip install -r scripts/requirements.txt
```
Expected: All packages install successfully.

**Step 5: Test scraper with a dry run**

Run:
```bash
python3 scripts/sync-essays.py
```
Expected: Scraper fetches the essay list, begins downloading and converting essays. Markdown files appear in `src/content/essays/`. This will take several minutes for all ~200 essays on first run.

**Step 6: Verify a generated essay file**

Run:
```bash
head -20 src/content/essays/how-to-do-great-work.md
```
Expected: YAML frontmatter with title, date, dateISO, slug, sourceUrl, wordCount, readingTime, followed by essay content in Markdown.

**Step 7: Commit**

```bash
git add scripts/ src/content/essays/
git commit -m "feat: add essay scraper and bootstrap all PG essays"
```

---

## Task 3: Base Layout & Theme System

**Files:**
- Create: `src/layouts/BaseLayout.astro`
- Create: `src/scripts/reader-settings.ts`
- Modify: `src/styles/global.css`
- Modify: `src/pages/index.astro`

**Step 1: Define CSS custom properties for theming**

Update `src/styles/global.css`:
```css
@import "tailwindcss";

@theme {
  --color-bg: var(--theme-bg);
  --color-text: var(--theme-text);
  --color-text-secondary: var(--theme-text-secondary);
  --color-border: var(--theme-border);
  --color-surface: var(--theme-surface);
  --color-accent: var(--theme-accent);
}

:root {
  /* Light theme (default) */
  --theme-bg: #ffffff;
  --theme-text: #1a1a1a;
  --theme-text-secondary: #6b7280;
  --theme-border: #e5e7eb;
  --theme-surface: #f9fafb;
  --theme-accent: #2563eb;

  /* Reader settings defaults */
  --reader-font-size: 18px;
  --reader-line-height: 1.7;
  --reader-max-width: 65ch;
  --reader-font-family: system-ui, -apple-system, sans-serif;
}

[data-theme="dark"] {
  --theme-bg: #111111;
  --theme-text: #e5e5e5;
  --theme-text-secondary: #9ca3af;
  --theme-border: #2d2d2d;
  --theme-surface: #1a1a1a;
  --theme-accent: #60a5fa;
}

[data-theme="sepia"] {
  --theme-bg: #f4ecd8;
  --theme-text: #433422;
  --theme-text-secondary: #78716c;
  --theme-border: #d6ceb8;
  --theme-surface: #ebe3cf;
  --theme-accent: #92400e;
}

body {
  background-color: var(--theme-bg);
  color: var(--theme-text);
  font-family: var(--reader-font-family);
  font-size: var(--reader-font-size);
  line-height: var(--reader-line-height);
  transition: background-color 0.3s ease, color 0.3s ease;
}
```

**Step 2: Create reader settings script**

Create `src/scripts/reader-settings.ts`:
```typescript
const STORAGE_KEY = "pg-reader-settings";

interface ReaderSettings {
  theme: "light" | "dark" | "sepia";
  fontFamily: "sans" | "serif" | "dyslexic";
  fontSize: number; // index 0-4
  lineHeight: number; // index 0-2
  contentWidth: "narrow" | "medium" | "wide";
}

const DEFAULTS: ReaderSettings = {
  theme: "light",
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

export function loadSettings(): ReaderSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULTS, ...JSON.parse(stored) };
  } catch {}
  return { ...DEFAULTS };
}

export function saveSettings(settings: ReaderSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  applySettings(settings);
}

export function applySettings(settings: ReaderSettings): void {
  const root = document.documentElement;

  // Theme
  root.setAttribute("data-theme", settings.theme);

  // Font
  root.style.setProperty("--reader-font-family", FONT_FAMILIES[settings.fontFamily]);
  root.style.setProperty("--reader-font-size", FONT_SIZES[settings.fontSize]);
  root.style.setProperty("--reader-line-height", LINE_HEIGHTS[settings.lineHeight]);
  root.style.setProperty("--reader-max-width", MAX_WIDTHS[settings.contentWidth]);
}

export function cycleTheme(): ReaderSettings {
  const settings = loadSettings();
  const themes: ReaderSettings["theme"][] = ["light", "dark", "sepia"];
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
```

**Step 3: Create BaseLayout**

Create `src/layouts/BaseLayout.astro`:
```astro
---
import "../styles/global.css";

interface Props {
  title: string;
  description?: string;
}

const { title, description = "All Paul Graham essays in a beautifully typeset web book." } = Astro.props;
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content={description} />
    <title>{title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <!-- Inline script to prevent FOUC: apply theme before paint -->
    <script is:inline>
      (function() {
        try {
          const s = JSON.parse(localStorage.getItem("pg-reader-settings") || "{}");
          if (s.theme) document.documentElement.setAttribute("data-theme", s.theme);
        } catch {}
      })();
    </script>
  </head>
  <body class="min-h-screen transition-colors duration-300">
    <slot />
  </body>
</html>
```

**Step 4: Update index.astro to use BaseLayout**

Replace `src/pages/index.astro`:
```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
---

<BaseLayout title="Paul Graham Essays">
  <main class="max-w-3xl mx-auto p-8">
    <h1 class="text-4xl font-bold tracking-tight mb-4"
        style="color: var(--theme-text);">
      Paul Graham Essays
    </h1>
    <p style="color: var(--theme-text-secondary);">Coming soon.</p>
  </main>
</BaseLayout>
```

**Step 5: Verify dev server**

Run:
```bash
npm run dev
```
Expected: Page renders with proper layout. Manually test by adding `data-theme="dark"` to `<html>` in dev tools — colors switch correctly.

**Step 6: Commit**

```bash
git add src/layouts/ src/scripts/reader-settings.ts src/styles/global.css src/pages/index.astro
git commit -m "feat: add base layout with theme system and reader settings"
```

---

## Task 4: Browse Mode (Index Page)

**Files:**
- Modify: `src/pages/index.astro`
- Create: `src/components/EssayCard.astro`
- Create: `src/components/SortControls.astro`
- Create: `src/components/Header.astro`

**Step 1: Create Header component**

Create `src/components/Header.astro`:
```astro
---
interface Props {
  currentPage?: "browse" | "book" | "highlights";
}
const { currentPage = "browse" } = Astro.props;
const base = import.meta.env.BASE_URL;
---

<header class="sticky top-0 z-50 border-b backdrop-blur-sm"
        style="background-color: color-mix(in srgb, var(--theme-bg) 85%, transparent); border-color: var(--theme-border);">
  <div class="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
    <a href={base} class="text-lg font-semibold tracking-tight" style="color: var(--theme-text);">
      PG Essays
    </a>
    <nav class="flex items-center gap-6 text-sm">
      <a href={base}
         class:list={["hover:opacity-80", { "font-semibold": currentPage === "browse" }]}
         style="color: var(--theme-text);">
        Browse
      </a>
      <a href={`${base}book`}
         class:list={["hover:opacity-80", { "font-semibold": currentPage === "book" }]}
         style="color: var(--theme-text);">
        Book
      </a>
      <a href={`${base}highlights`}
         class:list={["hover:opacity-80", { "font-semibold": currentPage === "highlights" }]}
         style="color: var(--theme-text);">
        Highlights
      </a>
      <button id="settings-toggle" class="p-2 rounded-lg hover:opacity-80" style="color: var(--theme-text);"
              aria-label="Reader settings">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </button>
    </nav>
  </div>
</header>
```

**Step 2: Create EssayCard component**

Create `src/components/EssayCard.astro`:
```astro
---
interface Props {
  title: string;
  date: string;
  readingTime: number;
  slug: string;
}
const { title, date, readingTime, slug } = Astro.props;
const base = import.meta.env.BASE_URL;
---

<a href={`${base}read/${slug}`}
   class="block py-4 border-b group"
   style="border-color: var(--theme-border);"
   data-essay-slug={slug}>
  <div class="flex items-start justify-between gap-4">
    <div class="flex-1 min-w-0">
      <h2 class="text-lg font-medium group-hover:opacity-70 transition-opacity"
          style="color: var(--theme-text);">
        <span class="read-check hidden mr-2 text-green-500">✓</span>
        {title}
      </h2>
      <div class="flex items-center gap-3 mt-1 text-sm"
           style="color: var(--theme-text-secondary);">
        {date && <span>{date}</span>}
        <span>·</span>
        <span>{readingTime} min read</span>
      </div>
    </div>
  </div>
</a>
```

**Step 3: Create SortControls component**

Create `src/components/SortControls.astro`:
```astro
<div class="flex flex-wrap items-center gap-3 mb-6 text-sm" style="color: var(--theme-text-secondary);">
  <span>Sort:</span>
  <button class="sort-btn px-3 py-1 rounded-full border" data-sort="date" style="border-color: var(--theme-border);">
    Newest
  </button>
  <button class="sort-btn px-3 py-1 rounded-full border" data-sort="alpha" style="border-color: var(--theme-border);">
    A–Z
  </button>
  <button class="sort-btn px-3 py-1 rounded-full border" data-sort="time" style="border-color: var(--theme-border);">
    Shortest
  </button>
  <button class="sort-btn px-3 py-1 rounded-full border" data-sort="unread" style="border-color: var(--theme-border);">
    Unread
  </button>
</div>
```

**Step 4: Build the full index page**

Replace `src/pages/index.astro`:
```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
import Header from "../components/Header.astro";
import EssayCard from "../components/EssayCard.astro";
import SortControls from "../components/SortControls.astro";
import { getCollection } from "astro:content";

const essays = (await getCollection("essays"))
  .sort((a, b) => b.data.dateISO.localeCompare(a.data.dateISO));

const totalWords = essays.reduce((sum, e) => sum + e.data.wordCount, 0);
---

<BaseLayout title="Paul Graham Essays">
  <Header currentPage="browse" />

  <main class="max-w-3xl mx-auto px-4 py-8">
    <!-- Stats -->
    <div class="mb-8">
      <h1 class="text-3xl font-bold tracking-tight mb-2" style="color: var(--theme-text);">
        Paul Graham Essays
      </h1>
      <p class="text-sm" style="color: var(--theme-text-secondary);">
        {essays.length} essays · {Math.round(totalWords / 1000)}k words
        <span id="reading-stats"></span>
      </p>
    </div>

    <!-- Search -->
    <div class="mb-6">
      <input
        type="text"
        id="search-input"
        placeholder="Search essays..."
        class="w-full px-4 py-2.5 rounded-lg border text-base outline-none"
        style="background-color: var(--theme-surface); border-color: var(--theme-border); color: var(--theme-text);"
      />
    </div>

    <SortControls />

    <!-- Essay list -->
    <div id="essay-list">
      {essays.map((essay) => (
        <EssayCard
          title={essay.data.title}
          date={essay.data.date}
          readingTime={essay.data.readingTime}
          slug={essay.data.slug}
        />
      ))}
    </div>
  </main>

  <script>
    import { initSettings } from "../scripts/reader-settings";
    initSettings();

    // Client-side search filtering
    const input = document.getElementById("search-input") as HTMLInputElement;
    const list = document.getElementById("essay-list")!;
    const cards = Array.from(list.children) as HTMLElement[];

    input?.addEventListener("input", () => {
      const q = input.value.toLowerCase();
      cards.forEach((card) => {
        const title = card.querySelector("h2")?.textContent?.toLowerCase() || "";
        card.style.display = title.includes(q) ? "" : "none";
      });
    });

    // Sort controls
    document.querySelectorAll(".sort-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sort = (btn as HTMLElement).dataset.sort;
        const sorted = [...cards].sort((a, b) => {
          if (sort === "alpha") {
            const tA = a.querySelector("h2")?.textContent || "";
            const tB = b.querySelector("h2")?.textContent || "";
            return tA.localeCompare(tB);
          }
          if (sort === "time") {
            const tA = parseInt(a.querySelector(".text-sm span:last-child")?.textContent || "0");
            const tB = parseInt(b.querySelector(".text-sm span:last-child")?.textContent || "0");
            return tA - tB;
          }
          // date (default): already in DOM order
          return 0;
        });
        sorted.forEach((card) => list.appendChild(card));
      });
    });
  </script>
</BaseLayout>
```

**Step 5: Verify the index page**

Run:
```bash
npm run dev
```
Expected: Index page shows all essays sorted by date, search filtering works, sort buttons reorder the list.

**Step 6: Commit**

```bash
git add src/components/ src/pages/index.astro
git commit -m "feat: add browse mode with essay cards, search, and sort controls"
```

---

## Task 5: Essay Page with Reader Layout

**Files:**
- Create: `src/layouts/EssayLayout.astro`
- Create: `src/pages/read/[...slug].astro`
- Create: `src/components/ProgressBar.astro`
- Create: `src/components/EssayNav.astro`

**Step 1: Create ProgressBar component**

Create `src/components/ProgressBar.astro`:
```astro
<div id="progress-bar" class="fixed top-0 left-0 h-0.5 z-[100] transition-all duration-150"
     style="width: 0%; background-color: var(--theme-accent);">
</div>

<script>
  const bar = document.getElementById("progress-bar")!;
  function updateProgress() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    bar.style.width = `${Math.min(100, progress)}%`;
  }
  window.addEventListener("scroll", updateProgress, { passive: true });
  updateProgress();
</script>
```

**Step 2: Create EssayNav component**

Create `src/components/EssayNav.astro`:
```astro
---
interface Props {
  prevEssay?: { title: string; slug: string } | null;
  nextEssay?: { title: string; slug: string } | null;
  currentIndex?: number;
  totalEssays?: number;
}
const { prevEssay, nextEssay, currentIndex, totalEssays } = Astro.props;
const base = import.meta.env.BASE_URL;
---

<nav class="mt-16 pt-8 border-t flex items-center justify-between gap-4"
     style="border-color: var(--theme-border);">
  {prevEssay ? (
    <a href={`${base}read/${prevEssay.slug}`}
       class="flex-1 group text-left"
       id="prev-essay">
      <span class="text-xs uppercase tracking-wide" style="color: var(--theme-text-secondary);">
        ← Previous
      </span>
      <p class="text-sm font-medium mt-1 group-hover:opacity-70 transition-opacity"
         style="color: var(--theme-text);">
        {prevEssay.title}
      </p>
    </a>
  ) : <div class="flex-1" />}

  {currentIndex !== undefined && totalEssays !== undefined && (
    <span class="text-xs shrink-0" style="color: var(--theme-text-secondary);">
      {currentIndex + 1} of {totalEssays}
    </span>
  )}

  {nextEssay ? (
    <a href={`${base}read/${nextEssay.slug}`}
       class="flex-1 group text-right"
       id="next-essay">
      <span class="text-xs uppercase tracking-wide" style="color: var(--theme-text-secondary);">
        Next →
      </span>
      <p class="text-sm font-medium mt-1 group-hover:opacity-70 transition-opacity"
         style="color: var(--theme-text);">
        {nextEssay.title}
      </p>
    </a>
  ) : <div class="flex-1" />}
</nav>
```

**Step 3: Create EssayLayout**

Create `src/layouts/EssayLayout.astro`:
```astro
---
import BaseLayout from "./BaseLayout.astro";
import Header from "../components/Header.astro";
import ProgressBar from "../components/ProgressBar.astro";
import EssayNav from "../components/EssayNav.astro";

interface Props {
  title: string;
  date: string;
  readingTime: number;
  sourceUrl: string;
  slug: string;
  prevEssay?: { title: string; slug: string } | null;
  nextEssay?: { title: string; slug: string } | null;
  currentIndex?: number;
  totalEssays?: number;
}

const { title, date, readingTime, sourceUrl, slug, prevEssay, nextEssay, currentIndex, totalEssays } = Astro.props;
---

<BaseLayout title={`${title} — Paul Graham`}>
  <ProgressBar />
  <Header />

  <article class="mx-auto px-4 py-12" style="max-width: var(--reader-max-width);"
           data-pagefind-body data-essay-slug={slug}>
    <!-- Essay header -->
    <header class="mb-10">
      <h1 class="text-3xl sm:text-4xl font-bold tracking-tight leading-tight mb-3"
          style="color: var(--theme-text);">
        {title}
      </h1>
      <div class="flex items-center gap-3 text-sm" style="color: var(--theme-text-secondary);">
        {date && <span>{date}</span>}
        <span>·</span>
        <span>{readingTime} min read</span>
        <span>·</span>
        <a href={sourceUrl} target="_blank" rel="noopener" class="hover:underline">
          Original ↗
        </a>
      </div>
    </header>

    <!-- Essay content (rendered Markdown) -->
    <div class="prose-pg">
      <slot />
    </div>

    <!-- Navigation -->
    <EssayNav
      prevEssay={prevEssay}
      nextEssay={nextEssay}
      currentIndex={currentIndex}
      totalEssays={totalEssays}
    />
  </article>

  <script>
    import { initSettings } from "../scripts/reader-settings";
    initSettings();

    // Keyboard navigation
    document.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const prev = document.getElementById("prev-essay") as HTMLAnchorElement | null;
      const next = document.getElementById("next-essay") as HTMLAnchorElement | null;

      if (e.key === "ArrowLeft" && prev) prev.click();
      if (e.key === "ArrowRight" && next) next.click();
    });
  </script>
</BaseLayout>
```

**Step 4: Add prose styles for essay content**

Append to `src/styles/global.css`:
```css
/* Essay prose styles */
.prose-pg p {
  margin-bottom: 1.25em;
}

.prose-pg a {
  color: var(--theme-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.prose-pg a:hover {
  opacity: 0.8;
}

.prose-pg blockquote {
  border-left: 3px solid var(--theme-border);
  padding-left: 1em;
  margin: 1.5em 0;
  font-style: italic;
  color: var(--theme-text-secondary);
}

.prose-pg h2, .prose-pg h3 {
  font-weight: 700;
  margin-top: 2em;
  margin-bottom: 0.75em;
  color: var(--theme-text);
}

.prose-pg h2 { font-size: 1.5em; }
.prose-pg h3 { font-size: 1.25em; }

.prose-pg ul, .prose-pg ol {
  padding-left: 1.5em;
  margin-bottom: 1.25em;
}

.prose-pg li {
  margin-bottom: 0.5em;
}

.prose-pg hr {
  border: none;
  border-top: 1px solid var(--theme-border);
  margin: 2em 0;
}
```

**Step 5: Create the dynamic essay page**

Create `src/pages/read/[...slug].astro`:
```astro
---
import { getCollection, render } from "astro:content";
import EssayLayout from "../../layouts/EssayLayout.astro";

export async function getStaticPaths() {
  const essays = (await getCollection("essays"))
    .sort((a, b) => a.data.dateISO.localeCompare(b.data.dateISO));

  return essays.map((essay, index) => ({
    params: { slug: essay.data.slug },
    props: {
      essay,
      prevEssay: index > 0 ? { title: essays[index - 1].data.title, slug: essays[index - 1].data.slug } : null,
      nextEssay: index < essays.length - 1 ? { title: essays[index + 1].data.title, slug: essays[index + 1].data.slug } : null,
      currentIndex: index,
      totalEssays: essays.length,
    },
  }));
}

const { essay, prevEssay, nextEssay, currentIndex, totalEssays } = Astro.props;
const { Content } = await render(essay);
---

<EssayLayout
  title={essay.data.title}
  date={essay.data.date}
  readingTime={essay.data.readingTime}
  sourceUrl={essay.data.sourceUrl}
  slug={essay.data.slug}
  prevEssay={prevEssay}
  nextEssay={nextEssay}
  currentIndex={currentIndex}
  totalEssays={totalEssays}
>
  <Content />
</EssayLayout>
```

**Step 6: Verify essay pages**

Run:
```bash
npm run dev
```
Expected: Navigate to any essay from the index. Essay renders with proper typography, progress bar works on scroll, prev/next navigation works, arrow key navigation works.

**Step 7: Commit**

```bash
git add src/layouts/EssayLayout.astro src/pages/read/ src/components/ProgressBar.astro src/components/EssayNav.astro src/styles/global.css
git commit -m "feat: add essay pages with reader layout, progress bar, and navigation"
```

---

## Task 6: Book Mode

**Files:**
- Create: `src/pages/book.astro`

**Step 1: Create book mode table of contents**

Create `src/pages/book.astro`:
```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
import Header from "../components/Header.astro";
import { getCollection } from "astro:content";

const essays = (await getCollection("essays"))
  .sort((a, b) => a.data.dateISO.localeCompare(b.data.dateISO));

// Group by year
const byYear = new Map<string, typeof essays>();
for (const essay of essays) {
  const year = essay.data.dateISO.slice(0, 4) || "Unknown";
  if (!byYear.has(year)) byYear.set(year, []);
  byYear.get(year)!.push(essay);
}
const base = import.meta.env.BASE_URL;
---

<BaseLayout title="Book Mode — Paul Graham Essays">
  <Header currentPage="book" />

  <main class="max-w-3xl mx-auto px-4 py-12">
    <header class="mb-12">
      <h1 class="text-3xl font-bold tracking-tight mb-2" style="color: var(--theme-text);">
        Read in Order
      </h1>
      <p class="text-sm" style="color: var(--theme-text-secondary);">
        {essays.length} essays, chronologically from Paul Graham's earliest to latest.
      </p>
    </header>

    {[...byYear.entries()].map(([year, yearEssays]) => (
      <section class="mb-10">
        <h2 class="text-lg font-semibold mb-4 sticky top-14 py-2 z-10"
            style="color: var(--theme-text); background-color: var(--theme-bg);">
          {year}
        </h2>
        <ol class="space-y-1">
          {yearEssays.map((essay, i) => (
            <li>
              <a href={`${base}read/${essay.data.slug}`}
                 class="flex items-baseline gap-3 py-2 group"
                 data-essay-slug={essay.data.slug}>
                <span class="text-xs tabular-nums shrink-0"
                      style="color: var(--theme-text-secondary);">
                  {essays.indexOf(essay) + 1}.
                </span>
                <span class="group-hover:opacity-70 transition-opacity"
                      style="color: var(--theme-text);">
                  <span class="read-check hidden mr-1 text-green-500">✓</span>
                  {essay.data.title}
                </span>
                <span class="text-xs shrink-0"
                      style="color: var(--theme-text-secondary);">
                  {essay.data.readingTime}m
                </span>
              </a>
            </li>
          ))}
        </ol>
      </section>
    ))}
  </main>

  <script>
    import { initSettings } from "../scripts/reader-settings";
    initSettings();
  </script>
</BaseLayout>
```

**Step 2: Verify book mode**

Run:
```bash
npm run dev
```
Expected: `/book` page shows all essays chronologically, grouped by year, with sticky year headers and numbering.

**Step 3: Commit**

```bash
git add src/pages/book.astro
git commit -m "feat: add book mode with chronological table of contents"
```

---

## Task 7: Reader Controls Panel

**Files:**
- Create: `src/components/ReaderControls.astro`
- Modify: `src/layouts/BaseLayout.astro` (add ReaderControls)

**Step 1: Create ReaderControls component**

Create `src/components/ReaderControls.astro`:
```astro
<div id="reader-controls" class="fixed inset-0 z-[200] hidden">
  <!-- Backdrop -->
  <div id="controls-backdrop" class="absolute inset-0 bg-black/40"></div>

  <!-- Panel -->
  <div class="absolute right-0 top-0 bottom-0 w-80 max-w-full p-6 overflow-y-auto shadow-xl"
       style="background-color: var(--theme-bg); border-left: 1px solid var(--theme-border);">
    <div class="flex items-center justify-between mb-8">
      <h2 class="text-lg font-semibold" style="color: var(--theme-text);">Reading Settings</h2>
      <button id="close-controls" class="p-1 hover:opacity-70" style="color: var(--theme-text);">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>

    <!-- Theme -->
    <div class="mb-8">
      <label class="text-xs uppercase tracking-wide font-medium mb-3 block"
             style="color: var(--theme-text-secondary);">Theme</label>
      <div class="flex gap-2">
        <button class="theme-btn flex-1 py-2 px-3 rounded-lg border text-sm" data-theme-value="light"
                style="background: #fff; color: #1a1a1a; border-color: var(--theme-border);">
          Light
        </button>
        <button class="theme-btn flex-1 py-2 px-3 rounded-lg border text-sm" data-theme-value="dark"
                style="background: #111; color: #e5e5e5; border-color: var(--theme-border);">
          Dark
        </button>
        <button class="theme-btn flex-1 py-2 px-3 rounded-lg border text-sm" data-theme-value="sepia"
                style="background: #f4ecd8; color: #433422; border-color: var(--theme-border);">
          Sepia
        </button>
      </div>
    </div>

    <!-- Font Family -->
    <div class="mb-8">
      <label class="text-xs uppercase tracking-wide font-medium mb-3 block"
             style="color: var(--theme-text-secondary);">Font</label>
      <div class="flex gap-2">
        <button class="font-btn flex-1 py-2 px-3 rounded-lg border text-sm" data-font="sans"
                style="font-family: system-ui; border-color: var(--theme-border); color: var(--theme-text);">
          Sans
        </button>
        <button class="font-btn flex-1 py-2 px-3 rounded-lg border text-sm" data-font="serif"
                style="font-family: Georgia; border-color: var(--theme-border); color: var(--theme-text);">
          Serif
        </button>
        <button class="font-btn flex-1 py-2 px-3 rounded-lg border text-sm" data-font="dyslexic"
                style="border-color: var(--theme-border); color: var(--theme-text);">
          Dyslexic
        </button>
      </div>
    </div>

    <!-- Font Size -->
    <div class="mb-8">
      <label class="text-xs uppercase tracking-wide font-medium mb-3 block"
             style="color: var(--theme-text-secondary);">Font Size</label>
      <div class="flex items-center gap-4">
        <button id="font-size-down" class="p-2 rounded-lg border"
                style="border-color: var(--theme-border); color: var(--theme-text);">
          A<span class="text-xs">-</span>
        </button>
        <div class="flex-1 h-1 rounded-full" style="background-color: var(--theme-border);">
          <div id="font-size-indicator" class="h-1 rounded-full" style="background-color: var(--theme-accent);"></div>
        </div>
        <button id="font-size-up" class="p-2 rounded-lg border"
                style="border-color: var(--theme-border); color: var(--theme-text);">
          A<span class="text-lg">+</span>
        </button>
      </div>
    </div>

    <!-- Line Height -->
    <div class="mb-8">
      <label class="text-xs uppercase tracking-wide font-medium mb-3 block"
             style="color: var(--theme-text-secondary);">Line Spacing</label>
      <div class="flex gap-2">
        <button class="lh-btn flex-1 py-2 px-3 rounded-lg border text-sm" data-lh="0"
                style="border-color: var(--theme-border); color: var(--theme-text);">
          Compact
        </button>
        <button class="lh-btn flex-1 py-2 px-3 rounded-lg border text-sm" data-lh="1"
                style="border-color: var(--theme-border); color: var(--theme-text);">
          Normal
        </button>
        <button class="lh-btn flex-1 py-2 px-3 rounded-lg border text-sm" data-lh="2"
                style="border-color: var(--theme-border); color: var(--theme-text);">
          Relaxed
        </button>
      </div>
    </div>

    <!-- Content Width -->
    <div class="mb-8">
      <label class="text-xs uppercase tracking-wide font-medium mb-3 block"
             style="color: var(--theme-text-secondary);">Content Width</label>
      <div class="flex gap-2">
        <button class="width-btn flex-1 py-2 px-3 rounded-lg border text-sm" data-width="narrow"
                style="border-color: var(--theme-border); color: var(--theme-text);">
          Narrow
        </button>
        <button class="width-btn flex-1 py-2 px-3 rounded-lg border text-sm" data-width="medium"
                style="border-color: var(--theme-border); color: var(--theme-text);">
          Medium
        </button>
        <button class="width-btn flex-1 py-2 px-3 rounded-lg border text-sm" data-width="wide"
                style="border-color: var(--theme-border); color: var(--theme-text);">
          Wide
        </button>
      </div>
    </div>
  </div>
</div>

<script>
  import { loadSettings, saveSettings } from "../scripts/reader-settings";

  const panel = document.getElementById("reader-controls")!;
  const backdrop = document.getElementById("controls-backdrop")!;
  const toggle = document.getElementById("settings-toggle");
  const close = document.getElementById("close-controls")!;

  function openPanel() { panel.classList.remove("hidden"); }
  function closePanel() { panel.classList.add("hidden"); }

  toggle?.addEventListener("click", openPanel);
  close.addEventListener("click", closePanel);
  backdrop.addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePanel();
  });

  // Theme buttons
  document.querySelectorAll(".theme-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const settings = loadSettings();
      settings.theme = (btn as HTMLElement).dataset.themeValue as any;
      saveSettings(settings);
    });
  });

  // Font buttons
  document.querySelectorAll(".font-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const settings = loadSettings();
      settings.fontFamily = (btn as HTMLElement).dataset.font as any;
      saveSettings(settings);
    });
  });

  // Font size
  document.getElementById("font-size-down")?.addEventListener("click", () => {
    const settings = loadSettings();
    settings.fontSize = Math.max(0, settings.fontSize - 1);
    saveSettings(settings);
    updateSizeIndicator(settings.fontSize);
  });
  document.getElementById("font-size-up")?.addEventListener("click", () => {
    const settings = loadSettings();
    settings.fontSize = Math.min(4, settings.fontSize + 1);
    saveSettings(settings);
    updateSizeIndicator(settings.fontSize);
  });

  function updateSizeIndicator(level: number) {
    const indicator = document.getElementById("font-size-indicator");
    if (indicator) indicator.style.width = `${((level + 1) / 5) * 100}%`;
  }

  // Line height
  document.querySelectorAll(".lh-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const settings = loadSettings();
      settings.lineHeight = parseInt((btn as HTMLElement).dataset.lh || "1");
      saveSettings(settings);
    });
  });

  // Width
  document.querySelectorAll(".width-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const settings = loadSettings();
      settings.contentWidth = (btn as HTMLElement).dataset.width as any;
      saveSettings(settings);
    });
  });

  // Initialize indicator
  updateSizeIndicator(loadSettings().fontSize);
</script>
```

**Step 2: Add ReaderControls to BaseLayout**

In `src/layouts/BaseLayout.astro`, add before `</body>`:
```astro
<slot />
<ReaderControls />
```

And add the import at the top of the frontmatter:
```astro
import ReaderControls from "../components/ReaderControls.astro";
```

**Step 3: Verify reader controls**

Run:
```bash
npm run dev
```
Expected: Click gear icon → panel slides in from right. Changing theme/font/size applies instantly. Settings persist on page reload.

**Step 4: Commit**

```bash
git add src/components/ReaderControls.astro src/layouts/BaseLayout.astro
git commit -m "feat: add reader controls panel with theme, font, and layout settings"
```

---

## Task 8: Reading History & Progress Tracking

**Files:**
- Create: `src/scripts/reading-history.ts`
- Modify: `src/layouts/EssayLayout.astro` (add tracking script)
- Modify: `src/pages/index.astro` (add read indicators)
- Modify: `src/pages/book.astro` (add read indicators)

**Step 1: Create reading history module**

Create `src/scripts/reading-history.ts`:
```typescript
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
```

**Step 2: Add scroll tracking to EssayLayout**

In `src/layouts/EssayLayout.astro`, add to the existing `<script>` tag:
```typescript
import { initScrollTracking } from "../scripts/reading-history";

const slug = document.querySelector("[data-essay-slug]")?.getAttribute("data-essay-slug");
const wordCount = parseInt(document.querySelector("[data-essay-slug]")?.getAttribute("data-word-count") || "0");
if (slug) initScrollTracking(slug, wordCount);
```

Also add `data-word-count` attribute to the `<article>` tag in EssayLayout:
```astro
<article ... data-word-count={String(essay.data?.wordCount || 0)}>
```

Note: Pass `wordCount` as a prop and add it as a data attribute.

**Step 3: Add read indicators to index page**

In `src/pages/index.astro`, add to the existing `<script>`:
```typescript
import { initReadIndicators, getStats } from "../scripts/reading-history";
initReadIndicators();

const stats = getStats();
const statsEl = document.getElementById("reading-stats");
if (statsEl && stats.essaysRead > 0) {
  statsEl.textContent = ` · ${stats.essaysRead} read`;
}
```

**Step 4: Add read indicators to book page**

In `src/pages/book.astro`, add to the existing `<script>`:
```typescript
import { initReadIndicators } from "../scripts/reading-history";
initReadIndicators();
```

**Step 5: Verify reading history**

Run:
```bash
npm run dev
```
Expected: Scroll to bottom of an essay → go back to index → essay shows checkmark. Reopen the essay → scrolls to saved position.

**Step 6: Commit**

```bash
git add src/scripts/reading-history.ts src/layouts/EssayLayout.astro src/pages/index.astro src/pages/book.astro
git commit -m "feat: add reading history with scroll tracking and read indicators"
```

---

## Task 9: Annotations & Highlights

**Files:**
- Create: `src/scripts/annotations.ts`
- Create: `src/pages/highlights.astro`
- Modify: `src/layouts/EssayLayout.astro` (add highlight support)

**Step 1: Create annotations module**

Create `src/scripts/annotations.ts`:
```typescript
const STORAGE_KEY = "pg-annotations";

interface Annotation {
  id: string;
  essaySlug: string;
  text: string;
  color: "yellow" | "green" | "blue" | "pink";
  startOffset: number;
  endOffset: number;
  parentSelector: string;
  createdAt: string;
}

type AnnotationStore = Record<string, Annotation[]>;

const COLORS: Record<string, string> = {
  yellow: "rgba(250, 204, 21, 0.3)",
  green: "rgba(74, 222, 128, 0.3)",
  blue: "rgba(96, 165, 250, 0.3)",
  pink: "rgba(244, 114, 182, 0.3)",
};

function getStore(): AnnotationStore {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveStore(store: AnnotationStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getAnnotations(slug: string): Annotation[] {
  return getStore()[slug] || [];
}

export function getAllAnnotations(): AnnotationStore {
  return getStore();
}

export function addAnnotation(slug: string, annotation: Omit<Annotation, "id" | "createdAt">): Annotation {
  const store = getStore();
  if (!store[slug]) store[slug] = [];

  const full: Annotation = {
    ...annotation,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  store[slug].push(full);
  saveStore(store);
  return full;
}

export function removeAnnotation(slug: string, id: string): void {
  const store = getStore();
  if (store[slug]) {
    store[slug] = store[slug].filter((a) => a.id !== id);
    if (store[slug].length === 0) delete store[slug];
    saveStore(store);
  }
}

export function exportAnnotations(format: "json" | "text"): string {
  const store = getStore();
  if (format === "json") return JSON.stringify(store, null, 2);

  let text = "Paul Graham Essays — My Highlights\n\n";
  for (const [slug, annotations] of Object.entries(store)) {
    text += `## ${slug}\n\n`;
    for (const a of annotations) {
      text += `> ${a.text}\n`;
      text += `  [${a.color}] — ${new Date(a.createdAt).toLocaleDateString()}\n\n`;
    }
  }
  return text;
}

export function initHighlightUI(slug: string): void {
  const proseEl = document.querySelector(".prose-pg");
  if (!proseEl) return;

  // Create popover
  const popover = document.createElement("div");
  popover.id = "highlight-popover";
  popover.className = "fixed z-[300] hidden";
  popover.innerHTML = `
    <div class="flex gap-1 p-2 rounded-lg shadow-lg border" style="background-color: var(--theme-bg); border-color: var(--theme-border);">
      <button class="hl-color w-6 h-6 rounded-full" data-color="yellow" style="background: ${COLORS.yellow}; border: 2px solid rgba(250,204,21,0.6);"></button>
      <button class="hl-color w-6 h-6 rounded-full" data-color="green" style="background: ${COLORS.green}; border: 2px solid rgba(74,222,128,0.6);"></button>
      <button class="hl-color w-6 h-6 rounded-full" data-color="blue" style="background: ${COLORS.blue}; border: 2px solid rgba(96,165,250,0.6);"></button>
      <button class="hl-color w-6 h-6 rounded-full" data-color="pink" style="background: ${COLORS.pink}; border: 2px solid rgba(244,114,182,0.6);"></button>
    </div>
  `;
  document.body.appendChild(popover);

  // Show popover on text selection
  document.addEventListener("mouseup", () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      popover.classList.add("hidden");
      return;
    }

    const range = selection.getRangeAt(0);
    if (!proseEl.contains(range.commonAncestorContainer)) {
      popover.classList.add("hidden");
      return;
    }

    const rect = range.getBoundingClientRect();
    popover.style.left = `${rect.left + rect.width / 2 - 60}px`;
    popover.style.top = `${rect.top - 45 + window.scrollY}px`;
    popover.classList.remove("hidden");
  });

  // Handle color button clicks
  popover.querySelectorAll(".hl-color").forEach((btn) => {
    btn.addEventListener("click", () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const color = (btn as HTMLElement).dataset.color as Annotation["color"];
      const text = selection.toString();

      addAnnotation(slug, {
        essaySlug: slug,
        text,
        color,
        startOffset: 0,
        endOffset: 0,
        parentSelector: "",
      });

      // Apply highlight visually
      const range = selection.getRangeAt(0);
      const mark = document.createElement("mark");
      mark.style.backgroundColor = COLORS[color];
      mark.style.borderRadius = "2px";
      mark.style.padding = "0 1px";
      range.surroundContents(mark);

      selection.removeAllRanges();
      popover.classList.add("hidden");
    });
  });
}
```

**Step 2: Create highlights page**

Create `src/pages/highlights.astro`:
```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
import Header from "../components/Header.astro";
---

<BaseLayout title="My Highlights — Paul Graham Essays">
  <Header currentPage="highlights" />

  <main class="max-w-3xl mx-auto px-4 py-12">
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold tracking-tight mb-2" style="color: var(--theme-text);">
          My Highlights
        </h1>
        <p id="highlight-count" class="text-sm" style="color: var(--theme-text-secondary);"></p>
      </div>
      <div class="flex gap-2">
        <button id="export-text" class="px-3 py-1.5 text-sm rounded-lg border"
                style="border-color: var(--theme-border); color: var(--theme-text);">
          Export Text
        </button>
        <button id="export-json" class="px-3 py-1.5 text-sm rounded-lg border"
                style="border-color: var(--theme-border); color: var(--theme-text);">
          Export JSON
        </button>
      </div>
    </div>

    <div id="highlights-container"></div>
    <p id="no-highlights" class="hidden text-center py-12"
       style="color: var(--theme-text-secondary);">
      No highlights yet. Select text in any essay to create a highlight.
    </p>
  </main>

  <script>
    import { initSettings } from "../scripts/reader-settings";
    import { getAllAnnotations, exportAnnotations } from "../scripts/annotations";
    initSettings();

    const container = document.getElementById("highlights-container")!;
    const countEl = document.getElementById("highlight-count")!;
    const noHighlights = document.getElementById("no-highlights")!;
    const store = getAllAnnotations();
    const base = import.meta.env.BASE_URL;

    const entries = Object.entries(store).filter(([, a]) => a.length > 0);
    const totalCount = entries.reduce((sum, [, a]) => sum + a.length, 0);

    if (entries.length === 0) {
      noHighlights.classList.remove("hidden");
      countEl.textContent = "0 highlights";
    } else {
      countEl.textContent = `${totalCount} highlights across ${entries.length} essays`;

      for (const [slug, annotations] of entries) {
        const section = document.createElement("div");
        section.className = "mb-8";
        section.innerHTML = `
          <h2 class="text-lg font-semibold mb-3">
            <a href="${base}read/${slug}" class="hover:underline" style="color: var(--theme-text);">
              ${slug.replace(/-/g, " ")}
            </a>
          </h2>
          <div class="space-y-3">
            ${annotations.map((a) => `
              <blockquote class="pl-4 py-2 rounded-r-lg text-sm" style="border-left: 3px solid; border-color: ${
                a.color === "yellow" ? "#facc15" :
                a.color === "green" ? "#4ade80" :
                a.color === "blue" ? "#60a5fa" : "#f472b6"
              }; color: var(--theme-text);">
                ${a.text}
                <div class="mt-1 text-xs" style="color: var(--theme-text-secondary);">
                  ${new Date(a.createdAt).toLocaleDateString()}
                </div>
              </blockquote>
            `).join("")}
          </div>
        `;
        container.appendChild(section);
      }
    }

    // Export
    function download(content: string, filename: string) {
      const blob = new Blob([content], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
    }

    document.getElementById("export-text")?.addEventListener("click", () => {
      download(exportAnnotations("text"), "pg-highlights.txt");
    });
    document.getElementById("export-json")?.addEventListener("click", () => {
      download(exportAnnotations("json"), "pg-highlights.json");
    });
  </script>
</BaseLayout>
```

**Step 3: Add highlight initialization to EssayLayout**

In `src/layouts/EssayLayout.astro`, add to the `<script>`:
```typescript
import { initHighlightUI } from "../scripts/annotations";
if (slug) initHighlightUI(slug);
```

**Step 4: Verify annotations**

Run:
```bash
npm run dev
```
Expected: Select text in an essay → color popover appears → click a color → text is highlighted. Navigate to `/highlights` → see all highlights grouped by essay. Export buttons produce downloadable files.

**Step 5: Commit**

```bash
git add src/scripts/annotations.ts src/pages/highlights.astro src/layouts/EssayLayout.astro
git commit -m "feat: add text annotations with highlights page and export"
```

---

## Task 10: Keyboard Shortcuts

**Files:**
- Create: `src/scripts/keyboard-shortcuts.ts`
- Create: `src/components/ShortcutsOverlay.astro`
- Modify: `src/layouts/BaseLayout.astro` (add shortcuts)

**Step 1: Create keyboard shortcuts module**

Create `src/scripts/keyboard-shortcuts.ts`:
```typescript
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
```

**Step 2: Create shortcuts overlay**

Create `src/components/ShortcutsOverlay.astro`:
```astro
<div id="shortcuts-overlay" class="fixed inset-0 z-[300] hidden flex items-center justify-center">
  <div class="absolute inset-0 bg-black/50" id="shortcuts-backdrop"></div>
  <div class="relative rounded-xl shadow-xl p-8 max-w-md w-full mx-4 border"
       style="background-color: var(--theme-bg); border-color: var(--theme-border);">
    <h2 class="text-lg font-semibold mb-6" style="color: var(--theme-text);">Keyboard Shortcuts</h2>
    <div class="grid grid-cols-2 gap-3 text-sm">
      <div class="flex items-center gap-3">
        <kbd class="px-2 py-0.5 rounded border text-xs font-mono"
             style="border-color: var(--theme-border); color: var(--theme-text);">←/→</kbd>
        <span style="color: var(--theme-text-secondary);">Prev/Next essay</span>
      </div>
      <div class="flex items-center gap-3">
        <kbd class="px-2 py-0.5 rounded border text-xs font-mono"
             style="border-color: var(--theme-border); color: var(--theme-text);">j/k</kbd>
        <span style="color: var(--theme-text-secondary);">Scroll down/up</span>
      </div>
      <div class="flex items-center gap-3">
        <kbd class="px-2 py-0.5 rounded border text-xs font-mono"
             style="border-color: var(--theme-border); color: var(--theme-text);">s</kbd>
        <span style="color: var(--theme-text-secondary);">Focus search</span>
      </div>
      <div class="flex items-center gap-3">
        <kbd class="px-2 py-0.5 rounded border text-xs font-mono"
             style="border-color: var(--theme-border); color: var(--theme-text);">d</kbd>
        <span style="color: var(--theme-text-secondary);">Cycle theme</span>
      </div>
      <div class="flex items-center gap-3">
        <kbd class="px-2 py-0.5 rounded border text-xs font-mono"
             style="border-color: var(--theme-border); color: var(--theme-text);">+/-</kbd>
        <span style="color: var(--theme-text-secondary);">Font size</span>
      </div>
      <div class="flex items-center gap-3">
        <kbd class="px-2 py-0.5 rounded border text-xs font-mono"
             style="border-color: var(--theme-border); color: var(--theme-text);">?</kbd>
        <span style="color: var(--theme-text-secondary);">This overlay</span>
      </div>
      <div class="flex items-center gap-3">
        <kbd class="px-2 py-0.5 rounded border text-xs font-mono"
             style="border-color: var(--theme-border); color: var(--theme-text);">Esc</kbd>
        <span style="color: var(--theme-text-secondary);">Close panels</span>
      </div>
    </div>
    <button id="close-shortcuts" class="mt-6 w-full py-2 rounded-lg border text-sm"
            style="border-color: var(--theme-border); color: var(--theme-text);">
      Close
    </button>
  </div>
</div>

<script>
  document.getElementById("shortcuts-backdrop")?.addEventListener("click", () => {
    document.getElementById("shortcuts-overlay")?.classList.add("hidden");
  });
  document.getElementById("close-shortcuts")?.addEventListener("click", () => {
    document.getElementById("shortcuts-overlay")?.classList.add("hidden");
  });
</script>
```

**Step 3: Add to BaseLayout**

In `src/layouts/BaseLayout.astro`, import and add both components before `</body>`:
```astro
import ShortcutsOverlay from "../components/ShortcutsOverlay.astro";
```
```astro
<ReaderControls />
<ShortcutsOverlay />
```

Add keyboard init to a script in BaseLayout:
```astro
<script>
  import { initKeyboardShortcuts } from "../scripts/keyboard-shortcuts";
  initKeyboardShortcuts();
</script>
```

**Step 4: Verify shortcuts**

Run:
```bash
npm run dev
```
Expected: Press `?` → overlay appears. Press `d` → theme cycles. Press `j`/`k` → page scrolls. Press `Esc` → panels close.

**Step 5: Commit**

```bash
git add src/scripts/keyboard-shortcuts.ts src/components/ShortcutsOverlay.astro src/layouts/BaseLayout.astro
git commit -m "feat: add keyboard shortcuts with help overlay"
```

---

## Task 11: Pagefind Search Integration

**Files:**
- Modify: `package.json` (build script)
- Modify: `src/pages/index.astro` (upgrade search)

**Step 1: Update build script for Pagefind**

Install Pagefind:
```bash
npm install -D pagefind
```

Update `package.json` build script:
```json
{
  "scripts": {
    "build": "astro build && npx pagefind --site dist"
  }
}
```

**Step 2: Add data-pagefind-body to essay pages**

Already done in Task 5 — the `<article>` in EssayLayout has `data-pagefind-body`.

**Step 3: Build and verify search index**

Run:
```bash
npm run build
```
Expected: Astro builds, then Pagefind indexes the site, reports number of pages indexed.

**Step 4: Commit**

```bash
git add package.json
git commit -m "feat: integrate Pagefind for full-text search"
```

---

## Task 12: Mobile Swipe Navigation

**Files:**
- Create: `src/scripts/swipe.ts`
- Modify: `src/layouts/EssayLayout.astro` (add swipe support)

**Step 1: Create swipe detection module**

Create `src/scripts/swipe.ts`:
```typescript
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
```

**Step 2: Add to EssayLayout**

In `src/layouts/EssayLayout.astro` `<script>`:
```typescript
import { initSwipeNavigation } from "../scripts/swipe";
initSwipeNavigation();
```

**Step 3: Verify on mobile**

Run:
```bash
npm run dev
```
Test with mobile device or Chrome DevTools device emulation. Expected: Swipe left/right navigates between essays.

**Step 4: Commit**

```bash
git add src/scripts/swipe.ts src/layouts/EssayLayout.astro
git commit -m "feat: add mobile swipe navigation for essays"
```

---

## Task 13: GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/sync-and-deploy.yml`

**Step 1: Create the workflow**

Create `.github/workflows/sync-and-deploy.yml`:
```yaml
name: Sync Essays & Deploy

on:
  schedule:
    - cron: '0 8 * * *'  # Daily at 8am UTC
  workflow_dispatch:       # Manual trigger
  push:
    branches: [master]

permissions:
  contents: write
  pages: write
  id-token: write

jobs:
  sync:
    runs-on: ubuntu-latest
    outputs:
      has_changes: ${{ steps.check.outputs.has_changes }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install Python dependencies
        run: pip install -r scripts/requirements.txt

      - name: Run essay sync
        run: python scripts/sync-essays.py

      - name: Check for changes
        id: check
        run: |
          if [ -n "$(git status --porcelain src/content/essays/)" ]; then
            echo "has_changes=true" >> $GITHUB_OUTPUT
          else
            echo "has_changes=false" >> $GITHUB_OUTPUT
          fi

      - name: Commit new essays
        if: steps.check.outputs.has_changes == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add src/content/essays/
          git commit -m "chore: sync new Paul Graham essays"
          git push

  deploy:
    needs: sync
    if: always()
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: master

      - name: Install, build, and upload
        uses: withastro/action@v5

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

**Step 2: Verify workflow syntax**

Run:
```bash
cat .github/workflows/sync-and-deploy.yml | head -5
```
Expected: Valid YAML output.

**Step 3: Commit**

```bash
git add .github/
git commit -m "feat: add GitHub Actions workflow for daily sync and deploy"
```

---

## Task 14: Final Polish & Build Verification

**Files:**
- Modify: `astro.config.mjs` (final settings)
- Verify full build works

**Step 1: Ensure astro.config.mjs is production-ready**

Verify `astro.config.mjs` has correct `site` and `base` values for GitHub Pages.

**Step 2: Run full build**

Run:
```bash
npm run build
```
Expected: Build completes without errors. Pagefind indexes all essay pages. Output in `dist/` directory.

**Step 3: Preview the build locally**

Run:
```bash
npm run preview
```
Expected: Site works at `localhost:4321`. All pages render. Navigation works. Search works (Pagefind).

**Step 4: Commit any final adjustments**

```bash
git add -A
git commit -m "chore: final polish and build verification"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Project scaffolding | astro.config, content.config, global.css |
| 2 | Essay scraper | sync-essays.py, requirements.txt |
| 3 | Base layout & themes | BaseLayout.astro, reader-settings.ts, global.css |
| 4 | Browse mode | index.astro, EssayCard, SortControls, Header |
| 5 | Essay reader page | EssayLayout.astro, [...slug].astro, ProgressBar, EssayNav |
| 6 | Book mode | book.astro |
| 7 | Reader controls panel | ReaderControls.astro |
| 8 | Reading history | reading-history.ts |
| 9 | Annotations | annotations.ts, highlights.astro |
| 10 | Keyboard shortcuts | keyboard-shortcuts.ts, ShortcutsOverlay |
| 11 | Pagefind search | package.json build script |
| 12 | Mobile swipe | swipe.ts |
| 13 | GitHub Actions | sync-and-deploy.yml |
| 14 | Final build verification | Full build + preview |
