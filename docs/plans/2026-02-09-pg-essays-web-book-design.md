# Paul Graham Essays — Web Book Design

## Overview

A static Astro.js website that collects all Paul Graham essays into a beautifully typeset web book with premium reading features. New essays are automatically detected and added daily via GitHub Actions.

## Decisions

| Decision | Choice |
|----------|--------|
| Reading experience | Hybrid — linear book mode + browsable index |
| Reading settings | Premium — full reader controls + history, annotations, keyboard nav |
| Daily sync | GitHub Actions cron + manual dispatch |
| Deployment | GitHub Pages |
| Visual aesthetic | Minimal & typographic |

## Stack

- **Astro.js** — static output mode, Content Collections for essays
- **Tailwind CSS** — styling
- **Vanilla JS** — no framework; Astro islands only where interactivity is needed
- **Python** — essay sync/scraper script
- **GitHub Pages** — hosting
- **GitHub Actions** — automated builds + essay sync
- **Pagefind** — client-side search (zero runtime cost)

## Project Structure

```
pg/
├── src/
│   ├── content/
│   │   └── essays/              # Markdown files (one per essay)
│   ├── layouts/
│   │   ├── BaseLayout.astro     # HTML shell, meta, reading settings
│   │   └── EssayLayout.astro    # Single essay view with reader controls
│   ├── pages/
│   │   ├── index.astro          # Landing / browsable index
│   │   ├── read/
│   │   │   └── [...slug].astro  # Individual essay pages
│   │   ├── book.astro           # Linear "book mode" table of contents
│   │   └── highlights.astro     # Aggregated highlights page
│   ├── components/
│   │   ├── ReaderControls.astro # Settings panel (theme, font, etc.)
│   │   ├── SearchBar.astro      # Client-side search via Pagefind
│   │   ├── ProgressBar.astro    # Reading progress
│   │   ├── TableOfContents.astro
│   │   └── EssayNav.astro       # Prev/next navigation
│   └── scripts/
│       ├── reader-settings.ts   # localStorage persistence for settings
│       ├── annotations.ts       # Highlight & annotation logic
│       └── reading-history.ts   # Track read/unread essays
├── scripts/
│   └── sync-essays.py           # Scraper for daily sync
├── .github/
│   └── workflows/
│       └── sync-and-deploy.yml  # Cron job + manual dispatch
└── astro.config.mjs
```

## Content Collection Schema

```ts
const essays = defineCollection({
  schema: z.object({
    title: z.string(),
    date: z.string(),          // "July 2023"
    dateISO: z.string(),       // "2023-07" for sorting
    slug: z.string(),
    sourceUrl: z.string(),     // original PG URL
    wordCount: z.number(),
    readingTime: z.number(),   // minutes
  })
});
```

## Navigation & Modes

### Browse Mode (index page)
- Searchable list of all essays via Pagefind
- Default sort: chronological (newest first)
- Alternative sorts: alphabetical, reading time, unread-first
- Each essay card: title, date, reading time, "read" checkmark

### Book Mode
- Table of contents ordered chronologically (oldest → newest)
- Prev/next links on every essay page
- Sticky progress: "Essay 47 of 213"
- Keyboard: ←/→ for prev/next, j/k for scroll

### Essay Page
- Centered column, max ~65ch wide
- Title + date + reading time at top
- Footnotes → sidenotes on wide screens, inline expandable on mobile
- Thin progress bar at top of viewport
- Floating action button: highlight toggle, bookmark, share
- Prev/next navigation at bottom

## Reader Settings

Accessible via gear icon in header. All persisted to localStorage, applied via CSS custom properties.

| Setting | Options |
|---------|---------|
| Theme | Light / Dark / Sepia (smooth transitions, no FOUC) |
| Font family | System sans / Georgia (serif) / OpenDyslexic |
| Font size | 5 steps (14px–22px) |
| Line height | 3 steps (1.5–2.0) |
| Content width | Narrow / Medium / Wide |

## Reading History

All localStorage, no backend.

- Essay marked "read" when scrolled past 90%
- Browse index shows checkmark on read essays
- "Show unread only" filter
- Reading stats: total essays read, total words, current streak
- Last position saved per essay — resume where you left off

## Annotations

- Select text → popover with highlight color options (yellow, green, blue, pink)
- Stored as `{ essaySlug, startOffset, endOffset, color, text, createdAt }`
- Rendered as colored background spans on page load
- `/highlights` page: all highlights grouped by essay with source links
- Export as plain text or JSON

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| ← / → | Previous / next essay (book mode) |
| j / k | Scroll down / up |
| t | Toggle table of contents sidebar |
| s | Focus search bar |
| d | Cycle theme (light → dark → sepia) |
| + / - | Increase / decrease font size |
| ? | Show keyboard shortcuts overlay |
| Esc | Close any open panel |

## Mobile

- Swipe left/right for prev/next essay
- Reader settings in bottom sheet
- Sidenotes collapse into expandable inline footnotes
- Progress bar stays at top, chrome hides on scroll

## Essay Sync Pipeline

### Scraper (`scripts/sync-essays.py`)

1. Fetch `paulgraham.com/articles.html`, parse all essay links
2. Compare against existing Markdown files — detect new essays
3. For each new essay:
   - Fetch HTML page
   - Extract title, date, body content
   - `htmldate` as fallback for date extraction
   - Convert HTML → Markdown via `html2text`
   - Calculate word count and reading time (230 wpm)
   - Generate frontmatter + Markdown file
   - Save to `src/content/essays/{slugified-title}.md`
4. If new essays added → commit and push → triggers deploy

### GitHub Actions Workflow

```yaml
on:
  schedule:
    - cron: '0 8 * * *'    # Daily at 8am UTC
  workflow_dispatch:         # Manual "sync now" button

jobs:
  sync:
    # Checkout, setup Python, run sync-essays.py, commit if changes

  deploy:
    needs: sync
    # Checkout, setup Node, build Astro, deploy to GitHub Pages
```

### Edge Cases

- Special characters in titles → slugified safely
- Missing dates → `htmldate` extracts from HTML metadata
- Rate limiting → 1-second delay between fetches
- Idempotent — re-running produces no changes if nothing is new

## Initial Bootstrap

First run scrapes all ~200+ essays. Subsequent runs are incremental.
