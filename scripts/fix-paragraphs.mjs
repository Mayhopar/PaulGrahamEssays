#!/usr/bin/env node
/**
 * Fix paragraph breaks in PG essay markdown files.
 *
 * The original scraper converted <br /><br /> (paragraph breaks) to single
 * newlines, making all paragraphs run together. This script fetches the
 * original HTML for each essay, identifies paragraph boundaries from the
 * <br /><br /> markers, and inserts blank lines in the markdown files
 * at the correct positions.
 *
 * Strategy:
 *   1. Read each .md file, extract sourceUrl from frontmatter
 *   2. Fetch the HTML from paulgraham.com
 *   3. Split HTML on <br /><br /> to get paragraph boundaries
 *   4. Extract the first ~40 chars of plain text from each paragraph
 *   5. Find those text snippets in the markdown body to locate paragraph starts
 *   6. Insert a blank line before each paragraph start
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const ESSAYS_DIR = join(
  import.meta.dirname,
  "..",
  "src",
  "content",
  "essays"
);

// Rate limit: delay between fetches (ms)
const FETCH_DELAY = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Strip HTML tags and decode basic entities to get plain text.
 */
function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize text for fuzzy matching: lowercase, collapse whitespace,
 * remove punctuation differences.
 */
function normalize(text) {
  return text
    .toLowerCase()
    // Replace markdown links [text](url) with just text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Replace markdown images ![alt](url) with alt
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[\s\n\r]+/g, " ")
    .replace(/[\_\*\[\]\(\)\\]/g, "")  // remove remaining markdown formatting chars
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract the first N words of plain text from an HTML fragment.
 */
function getParaSignature(htmlFragment, numWords = 8) {
  const plain = stripHtml(htmlFragment);
  const words = plain.split(/\s+/).filter(Boolean);
  return words.slice(0, numWords).join(" ");
}

/**
 * Given the markdown body (as array of lines), find the line index
 * where the given text signature starts.
 *
 * The signature must begin on the matched line itself (not on a later
 * line in the look-ahead window). We use a small look-ahead only to
 * gather enough text for a multi-line signature match.
 */
function findLineForSignature(lines, signature, startFrom = 0) {
  const normSig = normalize(signature);
  if (!normSig || normSig.length < 3) return -1;

  // Extract just the first few words of the signature to check
  // that the match actually starts on line i (not a subsequent line)
  const sigWords = normSig.split(" ");
  const firstWordOfSig = sigWords[0];

  for (let i = startFrom; i < lines.length; i++) {
    const normLine = normalize(lines[i]);
    // The line must contain the first word of the signature
    if (!normLine || !normLine.includes(firstWordOfSig)) continue;
    // More precisely, the line itself should start with the beginning of the sig
    // (or at least the first few words of the sig should appear at the start of the line)
    if (!normLine.startsWith(sigWords.slice(0, Math.min(2, sigWords.length)).join(" "))) {
      continue;
    }

    // Now build combined text from line i onward to check full signature
    let combined = "";
    for (let j = i; j < Math.min(i + 8, lines.length); j++) {
      combined += " " + lines[j];
    }
    const normCombined = normalize(combined).trimStart();
    if (normCombined.startsWith(normSig)) {
      return i;
    }
  }
  return -1;
}

/**
 * Fetch HTML for a given URL.
 */
async function fetchHtml(url) {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (paragraph-fix-script)",
    },
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} for ${url}`);
  }
  return await resp.text();
}

/**
 * Extract paragraph signatures from PG essay HTML.
 * Returns array of first-N-words of each paragraph.
 */
function extractParagraphSignatures(html) {
  // PG uses <br /><br /> or variations for paragraph breaks.
  // Also handle <br/><br/> and <br><br>
  const brPattern = /<br\s*\/?>\s*<br\s*\/?>/gi;

  // Find the main content area (inside the largest font or td)
  // For simplicity, just work with the full HTML
  const parts = html.split(brPattern);

  const signatures = [];
  for (const part of parts) {
    const sig = getParaSignature(part, 8);
    if (sig && sig.length >= 3) {
      signatures.push(sig);
    }
  }
  return signatures;
}

/**
 * Process a single markdown file.
 */
async function processFile(filepath) {
  const content = readFileSync(filepath, "utf-8");

  // Parse frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) {
    return { skipped: true, reason: "no frontmatter" };
  }

  const frontmatter = fmMatch[0];
  const body = content.slice(frontmatter.length);

  // Extract sourceUrl
  const urlMatch = fmMatch[1].match(/sourceUrl:\s*"([^"]+)"/);
  if (!urlMatch) {
    return { skipped: true, reason: "no sourceUrl" };
  }
  const sourceUrl = urlMatch[1];

  // Check if body already has many blank lines (already fixed)
  const blankLineCount = (body.match(/\n\n/g) || []).length;
  const totalLines = body.split("\n").length;
  if (blankLineCount > totalLines * 0.1) {
    return { skipped: true, reason: "already has many blank lines" };
  }

  // Fetch the original HTML
  let html;
  try {
    html = await fetchHtml(sourceUrl);
  } catch (e) {
    return { skipped: true, reason: `fetch error: ${e.message}` };
  }

  // Get paragraph signatures from HTML
  const signatures = extractParagraphSignatures(html);
  if (signatures.length < 2) {
    return { skipped: true, reason: "too few paragraphs found in HTML" };
  }

  // Now find where each paragraph starts in the markdown body
  const lines = body.split("\n");
  const paragraphStartLines = new Set();

  let searchFrom = 0;
  for (const sig of signatures) {
    const lineIdx = findLineForSignature(lines, sig, searchFrom);
    if (lineIdx >= 0) {
      paragraphStartLines.add(lineIdx);
      searchFrom = lineIdx + 1;
    }
  }

  if (paragraphStartLines.size < 2) {
    return { skipped: true, reason: "could not locate paragraph starts" };
  }

  // Also detect separator lines in the markdown (e.g. \_ \_ \_, * * *, ---)
  // These should always have blank lines around them
  const separatorPattern = /^\\?[_*-]\s*\\?[_*-]\s*\\?[_*-]\s*$/;
  for (let i = 0; i < lines.length; i++) {
    if (separatorPattern.test(lines[i].trim())) {
      paragraphStartLines.add(i);
      // Also mark the line after the separator as a paragraph start
      if (i + 1 < lines.length) {
        paragraphStartLines.add(i + 1);
      }
    }
  }

  // Build new body with blank lines inserted before paragraph starts
  const newLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (paragraphStartLines.has(i) && i > 0) {
      // Only add blank line if previous line isn't already blank
      const prevLine = newLines[newLines.length - 1];
      if (prevLine !== undefined && prevLine.trim() !== "") {
        newLines.push("");
      }
    }
    newLines.push(lines[i]);
  }

  const newBody = newLines.join("\n");
  const newContent = frontmatter + newBody;

  // Only write if something changed
  if (newContent !== content) {
    writeFileSync(filepath, newContent, "utf-8");
    const addedBlanks = paragraphStartLines.size;
    return { modified: true, paragraphs: addedBlanks };
  }

  return { skipped: true, reason: "no changes needed" };
}

async function main() {
  const files = readdirSync(ESSAYS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  console.log(`Found ${files.length} essay files to process.`);

  let modified = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filepath = join(ESSAYS_DIR, file);
    process.stdout.write(
      `[${i + 1}/${files.length}] ${file}... `
    );

    try {
      const result = await processFile(filepath);
      if (result.modified) {
        console.log(`OK (${result.paragraphs} paragraph breaks)`);
        modified++;
      } else {
        console.log(`skipped (${result.reason})`);
        skipped++;
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      errors++;
    }

    // Rate limit
    if (i < files.length - 1) {
      await sleep(FETCH_DELAY);
    }
  }

  console.log(`\nDone. Modified: ${modified}, Skipped: ${skipped}, Errors: ${errors}`);
}

main().catch(console.error);
