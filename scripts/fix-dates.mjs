/**
 * Fix essay dates by parsing the inline "Month Year" line from essay text.
 *
 * PG essays consistently start with a line like "November 2009" or
 * "March 2006, rev August 2009". The htmldate library used during scraping
 * frequently gets these wrong, so this script corrects frontmatter dates
 * by parsing them from the actual essay content.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ESSAYS_DIR = path.join(__dirname, "..", "src", "content", "essays");

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const monthPattern = MONTHS.join("|");

// Match lines like "November 2009" or "March 2006, rev August 2009"
// Captures the first Month Year found
const DATE_RE = new RegExp(`^\\s*(${monthPattern})\\s+(\\d{4})`, "m");

function parseInlineDate(body) {
  // Look in the first ~500 chars of the body for the date line
  const head = body.slice(0, 500);
  const match = head.match(DATE_RE);
  if (!match) return null;

  const month = match[1];
  const year = match[2];
  const monthNum = (MONTHS.indexOf(month) + 1).toString().padStart(2, "0");

  return {
    date: `${month} ${year}`,
    dateISO: `${year}-${monthNum}`,
  };
}

function main() {
  const files = fs.readdirSync(ESSAYS_DIR).filter((f) => f.endsWith(".md"));
  let fixed = 0;
  let skipped = 0;
  let alreadyCorrect = 0;

  for (const file of files) {
    const filepath = path.join(ESSAYS_DIR, file);
    const content = fs.readFileSync(filepath, "utf-8");

    // Split frontmatter from body
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!fmMatch) {
      console.log(`  SKIP (no frontmatter): ${file}`);
      skipped++;
      continue;
    }

    const frontmatter = fmMatch[1];
    const body = fmMatch[2];

    const parsed = parseInlineDate(body);
    if (!parsed) {
      console.log(`  SKIP (no inline date): ${file}`);
      skipped++;
      continue;
    }

    // Extract current frontmatter date
    const currentDate = frontmatter.match(/^date:\s*"(.*)"/m)?.[1];
    const currentISO = frontmatter.match(/^dateISO:\s*"(.*)"/m)?.[1];

    if (currentDate === parsed.date && currentISO === parsed.dateISO) {
      alreadyCorrect++;
      continue;
    }

    // Replace date fields in frontmatter
    const newFrontmatter = frontmatter
      .replace(/^date:\s*".*"/m, `date: "${parsed.date}"`)
      .replace(/^dateISO:\s*".*"/m, `dateISO: "${parsed.dateISO}"`);

    const newContent = `---\n${newFrontmatter}\n---\n${body}`;
    fs.writeFileSync(filepath, newContent, "utf-8");

    console.log(`  FIXED: ${file}  ${currentDate} -> ${parsed.date}`);
    fixed++;
  }

  console.log(`\nDone. Fixed: ${fixed}, Already correct: ${alreadyCorrect}, Skipped: ${skipped}`);
}

main();
