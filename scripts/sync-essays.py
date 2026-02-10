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


def html_to_markdown(element):
    """Convert a BeautifulSoup element to clean markdown."""
    # Unwrap layout and formatting tags (keep their content)
    for tag in element.find_all(["table", "tr", "td", "font"]):
        tag.unwrap()

    html = element.decode_contents()

    # Replace <br> and <br/> with newlines before markdownify
    # (markdownify chokes on bare <br> tags inside <p> elements)
    html = re.sub(r"<br\s*/?>", "\n", html)

    return md(html, heading_style="ATX")


def extract_content(soup):
    """Extract the main essay content from PG's varied HTML layouts."""
    body = soup.find("body")
    if not body:
        return ""

    # Remove scripts, styles, images
    for tag in body.find_all(["script", "style", "img"]):
        tag.decompose()

    # Strategy 1: Find the largest <font> tag (older essays)
    fonts = body.find_all("font")
    if fonts:
        best_font = max(fonts, key=lambda f: len(f.get_text()))
        if len(best_font.get_text(strip=True)) > 200:
            return html_to_markdown(best_font)

    # Strategy 2: Find the <td> with the most text (newer essays)
    tds = body.find_all("td")
    if tds:
        best_td = max(tds, key=lambda td: len(td.get_text()))
        if len(best_td.get_text(strip=True)) > 200:
            return html_to_markdown(best_td)

    # Strategy 3: Fallback — convert entire body
    return html_to_markdown(body)


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

    date_found = find_date(html)
    if date_found:
        date_iso = date_found[:7]  # "YYYY-MM"
        try:
            from datetime import datetime
            dt = datetime.strptime(date_found, "%Y-%m-%d")
            date_str = dt.strftime("%B %Y")
        except (ValueError, TypeError):
            date_str = date_found

    # Extract essay content
    content = extract_content(soup)

    # Clean up excessive whitespace and trailing table artifacts
    content = re.sub(r"\n{3,}", "\n\n", content)
    content = re.sub(r"\|\s*$", "", content)  # trailing pipe from tables
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
    escaped_title = title.replace('"', '\\"')
    frontmatter = f"""---
title: "{escaped_title}"
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
    import sys
    force = "--force" in sys.argv

    print("Fetching essay list...")
    links = get_essay_links()
    print(f"Found {len(links)} essays on articles page.")

    existing = get_existing_slugs()
    print(f"Already have {len(existing)} essays locally.")

    if force:
        print("Force mode: re-scraping ALL essays.")

    new_count = 0
    for link in links:
        slug = slugify(link["title"], max_length=80)
        if not force and slug in existing:
            continue

        print(f"  Scraping: {link['title']}...")
        try:
            data = scrape_essay(link["href"])
            if data and data["content"]:
                write_essay(slug, link["title"], data)
                new_count += 1
                print(f"    -> Saved as {slug}.md ({data['wordCount']} words)")
            else:
                print(f"    -> Skipped (no content)")
        except Exception as e:
            print(f"    -> Error: {e}")

        time.sleep(0.5)  # Be respectful

    print(f"\nDone. Wrote {new_count} essays.")
    return new_count


if __name__ == "__main__":
    main()
