/**
 * Interactive footnotes: tooltip on desktop, bottom sheet on mobile.
 *
 * Scans rendered essay HTML for two patterns:
 *   1. Link-style:  [<a href="#fNn">N</a>]
 *   2. Plain-text:  [N] inside paragraph text
 *
 * Footnote definitions live at the bottom in <div class="text-xs">
 * after a <strong>Notes</strong> heading.
 */

let activeTooltip: HTMLElement | null = null;
let activeSheet: HTMLElement | null = null;
let backdrop: HTMLElement | null = null;

// ── helpers ──────────────────────────────────────────────────────────

function isMobile(): boolean {
  return window.innerWidth < 768;
}

function escapeHtml(text: string): string {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

// ── parse footnote definitions ───────────────────────────────────────

function parseFootnotes(prose: HTMLElement): Map<string, string> {
  const map = new Map<string, string>();

  const notesSections = prose.querySelectorAll<HTMLElement>("div.text-xs");

  for (const section of notesSections) {
    const strong = section.querySelector("strong");
    if (!strong || !/^Notes/.test(strong.textContent || "")) continue;

    const html = section.innerHTML;
    const parts = html.split(/\[(\d+)\]/);

    for (let i = 1; i < parts.length; i += 2) {
      const num = parts[i];
      const rawHtml = parts[i + 1] || "";
      const temp = document.createElement("div");
      temp.innerHTML = rawHtml;
      const text = (temp.textContent || "").trim();
      if (text) map.set(num, text);
    }
  }

  return map;
}

// ── style helpers ────────────────────────────────────────────────────

function styleRef(btn: HTMLElement) {
  Object.assign(btn.style, {
    all: "unset",
    cursor: "pointer",
    color: "var(--theme-accent)",
    fontSize: "0.8em",
    fontWeight: "600",
    verticalAlign: "super",
    lineHeight: "1",
    padding: "0 1px",
    borderRadius: "2px",
    transition: "opacity 0.15s",
  });
  btn.addEventListener("mouseenter", () => { btn.style.opacity = "0.7"; });
  btn.addEventListener("mouseleave", () => { btn.style.opacity = "1"; });
}

function styleTooltip(el: HTMLElement) {
  Object.assign(el.style, {
    position: "fixed",
    zIndex: "9999",
    padding: "10px 14px",
    borderRadius: "8px",
    fontSize: "14px",
    lineHeight: "1.5",
    maxWidth: "360px",
    background: "var(--theme-surface)",
    color: "var(--theme-text)",
    border: "1px solid var(--theme-border)",
    boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
    opacity: "0",
    transform: "translateY(4px)",
    transition: "opacity 0.15s, transform 0.15s",
    pointerEvents: "auto",
  });
}

function showTooltipVisible(el: HTMLElement) {
  el.style.opacity = "1";
  el.style.transform = "translateY(0)";
}

function styleBackdrop(el: HTMLElement) {
  Object.assign(el.style, {
    position: "fixed",
    inset: "0",
    zIndex: "9998",
    background: "rgba(0,0,0,0.4)",
    opacity: "0",
    transition: "opacity 0.25s",
  });
}

function styleSheet(el: HTMLElement) {
  Object.assign(el.style, {
    position: "fixed",
    bottom: "0",
    left: "0",
    right: "0",
    zIndex: "9999",
    background: "var(--theme-surface)",
    borderTop: "1px solid var(--theme-border)",
    borderRadius: "16px 16px 0 0",
    padding: "12px 20px 28px",
    maxHeight: "60vh",
    overflowY: "auto",
    transform: "translateY(100%)",
    transition: "transform 0.3s cubic-bezier(0.22,1,0.36,1)",
  });
}

function styleHandle(el: HTMLElement) {
  Object.assign(el.style, {
    width: "36px",
    height: "4px",
    borderRadius: "2px",
    background: "var(--theme-border)",
    margin: "0 auto 12px",
  });
}

function styleLabel(el: HTMLElement) {
  Object.assign(el.style, {
    fontSize: "12px",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--theme-text-secondary)",
    marginBottom: "8px",
  });
}

function styleText(el: HTMLElement) {
  Object.assign(el.style, {
    fontSize: "15px",
    lineHeight: "1.6",
    color: "var(--theme-text)",
  });
}

// ── create tooltip (desktop) ─────────────────────────────────────────

function showTooltip(anchor: HTMLElement, text: string) {
  dismissAll();

  const tooltip = document.createElement("div");
  styleTooltip(tooltip);
  tooltip.textContent = text;
  document.body.appendChild(tooltip);

  const rect = anchor.getBoundingClientRect();

  requestAnimationFrame(() => {
    const tRect = tooltip.getBoundingClientRect();

    let top = rect.top - tRect.height - 8;
    if (top < 8) top = rect.bottom + 8;

    let left = rect.left + rect.width / 2 - tRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tRect.width - 8));

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    showTooltipVisible(tooltip);
  });

  activeTooltip = tooltip;

  setTimeout(() => {
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
  }, 0);
}

// ── create bottom sheet (mobile) ─────────────────────────────────────

function showBottomSheet(num: string, text: string) {
  dismissAll();

  backdrop = document.createElement("div");
  styleBackdrop(backdrop);
  document.body.appendChild(backdrop);

  const sheet = document.createElement("div");
  styleSheet(sheet);

  const handle = document.createElement("div");
  styleHandle(handle);
  sheet.appendChild(handle);

  const label = document.createElement("div");
  styleLabel(label);
  label.textContent = `Note ${num}`;
  sheet.appendChild(label);

  const body = document.createElement("div");
  styleText(body);
  body.textContent = text;
  sheet.appendChild(body);

  document.body.appendChild(sheet);
  activeSheet = sheet;

  requestAnimationFrame(() => {
    backdrop!.style.opacity = "1";
    sheet.style.transform = "translateY(0)";
  });

  backdrop.addEventListener("click", dismissAll);
  document.addEventListener("keydown", onEsc);

  // Swipe down to dismiss
  let startY = 0;
  let currentY = 0;
  sheet.addEventListener("touchstart", (e) => {
    startY = e.touches[0].clientY;
    currentY = startY;
    sheet.style.transition = "none";
  }, { passive: true });

  sheet.addEventListener("touchmove", (e) => {
    currentY = e.touches[0].clientY;
    const dy = Math.max(0, currentY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });

  sheet.addEventListener("touchend", () => {
    sheet.style.transition = "transform 0.3s cubic-bezier(0.22,1,0.36,1)";
    if (currentY - startY > 80) {
      dismissAll();
    } else {
      sheet.style.transform = "translateY(0)";
    }
  }, { passive: true });
}

// ── dismiss helpers ──────────────────────────────────────────────────

function dismissAll() {
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
  if (activeSheet) {
    activeSheet.style.transform = "translateY(100%)";
    const s = activeSheet;
    s.addEventListener("transitionend", () => s.remove(), { once: true });
    setTimeout(() => s.remove(), 300);
    activeSheet = null;
  }
  if (backdrop) {
    backdrop.style.opacity = "0";
    const b = backdrop;
    b.addEventListener("transitionend", () => b.remove(), { once: true });
    setTimeout(() => b.remove(), 300);
    backdrop = null;
  }
  document.removeEventListener("click", onDocClick);
  document.removeEventListener("keydown", onEsc);
}

function onDocClick(e: MouseEvent) {
  if (activeTooltip && !activeTooltip.contains(e.target as Node)) {
    dismissAll();
  }
}

function onEsc(e: KeyboardEvent) {
  if (e.key === "Escape") dismissAll();
}

// ── wire up inline references ────────────────────────────────────────

function wrapPlainTextNotes(prose: HTMLElement, footnotes: Map<string, string>) {
  const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (parent?.closest("div.text-xs")) return NodeFilter.FILTER_REJECT;
      if (parent?.closest("[data-fn]")) return NodeFilter.FILTER_REJECT;
      if (/\[\d+\]/.test(node.textContent || "")) return NodeFilter.FILTER_ACCEPT;
      return NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) {
    textNodes.push(current as Text);
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent || "";
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    const regex = /\[(\d+)\]/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const num = match[1];
      if (!footnotes.has(num)) continue;

      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const btn = document.createElement("button");
      btn.setAttribute("data-fn", num);
      btn.setAttribute("aria-label", `Footnote ${num}`);
      btn.textContent = `[${num}]`;
      styleRef(btn);
      frag.appendChild(btn);

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex === 0) continue;

    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode!.replaceChild(frag, textNode);
  }
}

function wrapLinkedNotes(prose: HTMLElement, footnotes: Map<string, string>) {
  const links = prose.querySelectorAll<HTMLAnchorElement>('a[href^="#f"]');

  for (const link of links) {
    const num = link.textContent?.trim();
    if (!num || !footnotes.has(num)) continue;

    const parent = link.parentNode;
    if (!parent) continue;
    if ((parent as HTMLElement).closest?.("[data-fn]")) continue;

    const btn = document.createElement("button");
    btn.setAttribute("data-fn", num);
    btn.setAttribute("aria-label", `Footnote ${num}`);
    btn.textContent = `[${num}]`;
    styleRef(btn);

    // Remove surrounding bracket text nodes
    const prev = link.previousSibling;
    const next = link.nextSibling;

    if (prev && prev.nodeType === Node.TEXT_NODE) {
      prev.textContent = (prev.textContent || "").replace(/\[\s*$/, "");
    }
    if (next && next.nodeType === Node.TEXT_NODE) {
      next.textContent = (next.textContent || "").replace(/^\s*\]/, "");
    }

    link.replaceWith(btn);
  }
}

// ── main init ────────────────────────────────────────────────────────

export function initFootnotes() {
  const prose = document.querySelector<HTMLElement>(".prose-pg");
  if (!prose) return;

  const footnotes = parseFootnotes(prose);
  if (footnotes.size === 0) return;

  wrapLinkedNotes(prose, footnotes);
  wrapPlainTextNotes(prose, footnotes);

  prose.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-fn]");
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const num = btn.dataset.fn;
    if (!num || !footnotes.has(num)) return;
    const text = footnotes.get(num)!;

    if (isMobile()) {
      showBottomSheet(num, text);
    } else {
      showTooltip(btn, text);
    }
  });
}
