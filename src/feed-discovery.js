((root, createApi) => {
  const api = createApi();
  root.FeedLensFeedDiscovery = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(globalThis, () => {
  const FEED_MIME_TYPES = new Set([
    "application/rss+xml",
    "application/atom+xml",
    "application/rdf+xml",
    "application/feed+xml",
    "text/rss+xml",
    "text/atom+xml"
  ]);

  function isCanonicalFeedLink({ rel, type, href } = {}) {
    if (!String(href || "").trim()) return false;
    const relTokens = String(rel || "").toLowerCase().split(/\s+/).filter(Boolean);
    const mimeType = String(type || "").toLowerCase().split(";", 1)[0].trim();
    return relTokens.includes("alternate") && FEED_MIME_TYPES.has(mimeType);
  }

  function isDeclaredFeedAnchor({ href, text, ariaLabel, title, className, id } = {}) {
    if (!isFeedDocumentHref(href)) return false;

    const label = [text, ariaLabel, title]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");
    const identifier = [className, id]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");

    return /(?:^|[^a-z])(rss|atom|opml)(?:$|[^a-z])/.test(label) ||
      /(?:^|[\s_-])(rss|atom|opml)(?:$|[\s_-])/.test(identifier);
  }

  function isFeedDocumentHref(rawHref) {
    try {
      const url = new URL(String(rawHref || ""), "https://feedlens.invalid");
      if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      const pathname = url.pathname;
      return /\.(?:rss|atom|opml|xml)$/i.test(pathname);
    } catch {
      return false;
    }
  }

  return {
    isDeclaredFeedAnchor,
    isCanonicalFeedLink
  };
});
