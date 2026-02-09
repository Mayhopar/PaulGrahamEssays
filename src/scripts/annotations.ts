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
