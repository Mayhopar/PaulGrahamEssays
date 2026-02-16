/**
 * Remove the inline "Month Year" date line from essay body text,
 * since it's already shown in the header metadata.
 *
 * Handles patterns like:
 *   "November 2009"
 *   "March 2006, rev August 2009"
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

// Match a standalone date line like "November 2009" or "March 2006, rev August 2009"
// with optional surrounding blank lines
const DATE_LINE_RE = new RegExp(
  `\\n*(${monthPattern})\\s+\\d{4}(,\\s*rev\\.?\\s*(${monthPattern})\\s+\\d{4})?\\s*\\n+`,
  ""
);

function main() {
  const files = fs.readdirSync(ESSAYS_DIR).filter((f) => f.endsWith(".md"));
  let stripped = 0;
  let noMatch = 0;

  for (const file of files) {
    const filepath = path.join(ESSAYS_DIR, file);
    const content = fs.readFileSync(filepath, "utf-8");

    // Split frontmatter from body
    const fmEnd = content.indexOf("---", 4);
    if (fmEnd === -1) continue;
    const afterFm = fmEnd + 3;
    const frontmatter = content.slice(0, afterFm);
    const body = content.slice(afterFm);

    // Only look in the first ~600 chars of the body for the date line
    const head = body.slice(0, 600);
    const match = head.match(DATE_LINE_RE);

    if (!match) {
      noMatch++;
      continue;
    }

    // Remove the date line, preserving a single blank line
    const newHead = head.slice(0, match.index) + "\n\n" + head.slice(match.index + match[0].length).replace(/^\n+/, "");
    const newBody = newHead + body.slice(600);

    // Clean up triple+ newlines
    const cleanBody = newBody.replace(/\n{3,}/g, "\n\n");

    const newContent = frontmatter + cleanBody;

    if (newContent !== content) {
      fs.writeFileSync(filepath, newContent, "utf-8");
      console.log(`  STRIPPED: ${file}  ("${match[0].trim()}")`);
      stripped++;
    }
  }

  console.log(`\nDone. Stripped: ${stripped}, No date found: ${noMatch}`);
}

main();
