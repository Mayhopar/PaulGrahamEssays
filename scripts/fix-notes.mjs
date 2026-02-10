import fs from 'fs';
import path from 'path';

const ESSAYS_DIR = path.resolve('src/content/essays');

// Patterns that indicate the start of the notes/acknowledgements section at the end
// These are tested against trimmed lines
const NOTE_SECTION_PATTERNS = [
  /^\*\*Notes?\*\*/,           // **Notes** or **Note**
  /^\*\*Notes?:\*\*/,          // **Notes:** or **Note:**
  /^\[\*\*Notes?\*\*\]/,       // [**Notes**](link)
  /^\*\*Thanks\*?\*?/,         // **Thanks** or **Thanks to ...
  /^\*\*Related:\*\*/,         // **Related:**
];

function findNoteSectionStart(lines) {
  // Scan from the end backwards to find the earliest line that is part of
  // the notes/acknowledgements section.
  //
  // Strategy: Find all lines that match a note section pattern.
  // The notes section starts at the earliest such marker, PROVIDED
  // there is no large gap of non-note content between it and the end.
  //
  // In practice, PG essays have these sections contiguously at the end:
  //   **Notes** -> footnotes -> **Thanks** -> **Note:** -> **Related:**
  // So we find the earliest matching marker line.

  let earliestMarker = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    for (const pattern of NOTE_SECTION_PATTERNS) {
      if (pattern.test(trimmed)) {
        if (earliestMarker === -1) {
          earliestMarker = i;
        }
        break;
      }
    }
  }

  if (earliestMarker === -1) {
    return -1;
  }

  // Validate: the marker should be in the last ~60% of the file to avoid
  // false positives from mid-essay content.
  // Actually, since we verified that **Notes**, **Thanks**, and **Related:**
  // only appear once per file and always near the end, this is safe.
  // But let's add a sanity check: the marker should be past the halfway point
  // of the file (with some tolerance for very short files).
  const minLine = Math.max(10, Math.floor(lines.length * 0.2));
  if (earliestMarker < minLine) {
    // This would be unusual - a notes section starting very early in the file.
    // For safety, skip this file.
    return -1;
  }

  // Now look backward from earliestMarker to see if there's a preceding blank
  // line (common pattern) and include it in the wrap point.
  // We want to start the div BEFORE the blank line preceding the marker.
  let startLine = earliestMarker;

  // Check if there's a blank line right before the marker
  if (startLine > 0 && lines[startLine - 1].trim() === '') {
    // Don't include the blank line before - we'll insert the div tag there
    // Actually, we want the div to wrap the notes content.
    // The blank line before is part of the essay body separation.
  }

  return startLine;
}

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Skip files that already have the wrapper
  if (content.includes('<div class="text-xs">')) {
    return false;
  }

  const lines = content.split('\n');
  const startLine = findNoteSectionStart(lines);

  if (startLine === -1) {
    return false;
  }

  // Build the new content:
  // Everything before the notes section stays the same.
  // Then we insert <div class="text-xs">\n\n before the notes section.
  // Then the notes section content.
  // Then \n\n</div> at the end.

  const beforeNotes = lines.slice(0, startLine);
  const notesContent = lines.slice(startLine);

  // Trim trailing empty lines from notesContent
  while (notesContent.length > 0 && notesContent[notesContent.length - 1].trim() === '') {
    notesContent.pop();
  }

  // Also trim trailing empty lines from beforeNotes to avoid excess blank lines
  while (beforeNotes.length > 0 && beforeNotes[beforeNotes.length - 1].trim() === '') {
    beforeNotes.pop();
  }

  const newContent = [
    ...beforeNotes,
    '',
    '<div class="text-xs">',
    '',
    ...notesContent,
    '',
    '</div>',
    '',
  ].join('\n');

  fs.writeFileSync(filePath, newContent, 'utf-8');
  return true;
}

// Main
const files = fs.readdirSync(ESSAYS_DIR)
  .filter(f => f.endsWith('.md'))
  .sort();

let modified = 0;
let skipped = 0;
let noNotes = 0;

for (const file of files) {
  const filePath = path.join(ESSAYS_DIR, file);
  const result = processFile(filePath);
  if (result) {
    modified++;
    console.log(`  Modified: ${file}`);
  } else {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.includes('<div class="text-xs">')) {
      skipped++;
      console.log(`  Skipped (already wrapped): ${file}`);
    } else {
      noNotes++;
      console.log(`  No notes section: ${file}`);
    }
  }
}

console.log(`\n--- Summary ---`);
console.log(`Total files: ${files.length}`);
console.log(`Modified: ${modified}`);
console.log(`Already wrapped: ${skipped}`);
console.log(`No notes section found: ${noNotes}`);
