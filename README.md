# FeedLens

FeedLens is a small Chrome/Edge extension that discovers and previews RSS, Atom, XML, and OPML feeds in a clean reader interface.

## What It Does

- Detects RSS, Atom, and common XML feed pages automatically.
- Discovers feeds advertised by ordinary websites and shows a floating RSS button.
- Opens a discovered site feed in the FeedLens reader with one click.
- Detects OPML subscription lists and shows them as feed cards.
- Parses feed metadata, entries, dates, authors, links, summaries, and common feed modules.
- Opens a lightweight extension preview page instead of fighting the browser's XML viewer.
- Shows the feed URL in the list header and provides a one-click copy button.
- Keeps a Raw XML escape hatch when you need to inspect the original feed.
- Supports keyboard navigation with Up/Down or J/K.
- Marks OPML feed cards after you click them.
- Sanitizes entry HTML with a vendored DOMPurify build before rendering it in the page.
- Keeps original article links available from the reader view.

## Lightweight Dependency Policy

FeedLens is a feed previewer, not a full RSS reader. It vendors only DOMPurify's browser build for safe HTML cleanup and avoids heavy feed parsing, subscription, sync, and full-text extraction dependencies.

## Feed Compatibility

FeedLens parses feeds by XML local names instead of brittle CSS selectors, so namespaced feeds are handled more reliably.

- RSS 0.91, 0.92, and 2.0: `rss > channel > item`
- RSS 0.90 and 1.0 RDF: `rdf:RDF`, `channel`, and top-level `item`
- Atom 1.0: `feed > entry`, including `content`, `summary`, and alternate links
- OPML 1.0/2.0: grouped `outline` sections and feed `outline` cards with `xmlUrl`, `htmlUrl`, `title`, and `text`
- Common modules: Dublin Core creator/date, Content module `content:encoded`, Media RSS thumbnails/content, iTunes image, and image enclosures

## Load Locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this folder.
5. Visit an RSS or Atom feed URL, or visit a website that advertises an RSS/Atom feed.
6. On feed-enabled websites, click the floating RSS button or the extension action badge to open the discovered feed in FeedLens.

For local `.opml` files, enable **Allow access to file URLs** for the extension in `chrome://extensions`.

No build step is required.
