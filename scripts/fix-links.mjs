/**
 * Rewrites broken relative .html links in essay markdown files
 * to point to the correct /read/[slug] paths.
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const ESSAYS_DIR = join(import.meta.dirname, "../src/content/essays");

// Step 1: Build mapping from PG short name → project slug
const pgToSlug = new Map();
const files = readdirSync(ESSAYS_DIR).filter((f) => f.endsWith(".md"));

for (const file of files) {
  const content = readFileSync(join(ESSAYS_DIR, file), "utf-8");
  const slugMatch = content.match(/^slug:\s*"?(.+?)"?\s*$/m);
  const sourceMatch = content.match(/^sourceUrl:\s*"?(.+?)"?\s*$/m);
  if (!slugMatch || !sourceMatch) continue;

  const slug = slugMatch[1];
  const sourceUrl = sourceMatch[1];
  // Extract short name: "https://paulgraham.com/convince.html" → "convince"
  const shortMatch = sourceUrl.match(/\/([^/]+)\.html$/);
  if (shortMatch) {
    pgToSlug.set(shortMatch[1], slug);
  }
}

console.log(`Built mapping: ${pgToSlug.size} entries`);

// Step 2: Rewrite links in all essay files
let totalFixed = 0;
let totalExternal = 0;

for (const file of files) {
  const filePath = join(ESSAYS_DIR, file);
  const original = readFileSync(filePath, "utf-8");
  let content = original;

  // Pattern 1: Relative links like (convince.html) or (convince.html#anchor)
  content = content.replace(
    /\]\(([a-zA-Z0-9_-]+)\.html(#[^)]*?)?\)/g,
    (match, shortName, anchor) => {
      const slug = pgToSlug.get(shortName);
      if (slug) {
        totalFixed++;
        return `](/read/${slug}${anchor || ""})`;
      }
      // Not in our collection — link to paulgraham.com
      totalExternal++;
      return `](https://paulgraham.com/${shortName}.html${anchor || ""})`;
    }
  );

  // Pattern 2: Full paulgraham.com links like (http://www.paulgraham.com/convince.html)
  content = content.replace(
    /\]\(https?:\/\/(?:www\.)?paulgraham\.com\/([a-zA-Z0-9_-]+)\.html(#[^)]*?)?\)/g,
    (match, shortName, anchor) => {
      const slug = pgToSlug.get(shortName);
      if (slug) {
        totalFixed++;
        return `](/read/${slug}${anchor || ""})`;
      }
      // Keep as-is if not in our collection
      return match;
    }
  );

  if (content !== original) {
    writeFileSync(filePath, content, "utf-8");
    console.log(`  Updated: ${file}`);
  }
}

console.log(`\nDone: ${totalFixed} links fixed to /read/ paths, ${totalExternal} linked to paulgraham.com`);
