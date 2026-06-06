(() => {
  if (globalThis.__feedLensDiscoverBootstrapped) return;
  globalThis.__feedLensDiscoverBootstrapped = true;

  const FEED_TYPES = new Set([
    "application/rss+xml",
    "application/atom+xml",
    "application/rdf+xml",
    "application/feed+xml",
    "application/xml",
    "text/rss+xml",
    "text/atom+xml",
    "text/xml"
  ]);
  const FEED_HREF_PATTERN = /(?:^|\/)(?:feed|rss|atom|index\.xml|feed\.xml|rss\.xml|atom\.xml|\.rss|\.atom|\.opml)(?:[?#/]|$)/i;
  const BUTTON_ID = "feedlens-discover-button";
  const STYLE_ID = "feedlens-discover-style";

  function discoverFeeds() {
    const candidates = [...document.querySelectorAll("link[href]")]
      .filter(isFeedLink)
      .map(feedFromLink)
      .filter(Boolean);

    return uniqueFeeds(candidates);
  }

  function isFeedLink(link) {
    const relTokens = (link.getAttribute("rel") || "").toLowerCase().split(/\s+/);
    const type = (link.getAttribute("type") || "").toLowerCase().trim();
    const href = link.getAttribute("href") || "";
    if (!href) return false;

    const isAlternate = relTokens.includes("alternate");
    const isFeedType = FEED_TYPES.has(type) || type.endsWith("+xml");
    return (isAlternate && isFeedType) || FEED_HREF_PATTERN.test(href);
  }

  function feedFromLink(link) {
    try {
      const url = new URL(link.getAttribute("href"), document.baseURI).href;
      return {
        url,
        title: normalize(link.getAttribute("title")) || normalize(document.title) || url,
        type: normalize(link.getAttribute("type"))
      };
    } catch {
      return null;
    }
  }

  function uniqueFeeds(feeds) {
    const seen = new Set();
    return feeds.filter((feed) => {
      if (seen.has(feed.url)) return false;
      seen.add(feed.url);
      return true;
    });
  }

  function normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function mountButton(feeds) {
    if (!feeds.length || document.getElementById(BUTTON_ID)) return;
    injectStyle();

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.title = feeds.length > 1 ? `Open ${feeds.length} feeds with FeedLens` : "Open RSS with FeedLens";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = `
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 17C5.2091 17 7 18.7909 7 21H3V17ZM3 10C9.0751 10 14 14.9249 14 21H12C12 16.0294 7.9706 12 3 12V10ZM3 3C12.9411 3 21 11.0589 21 21H19C19 12.1634 11.8366 5 3 5V3Z"></path>
      </svg>
      <span>${feeds.length > 1 ? feeds.length : ""}</span>
    `;
    button.addEventListener("click", () => openFeed(feeds[0]));
    document.documentElement.append(button);
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID} {
        position: fixed;
        right: max(16px, env(safe-area-inset-right));
        bottom: max(16px, env(safe-area-inset-bottom));
        z-index: 2147483647;
        display: inline-grid;
        grid-template-columns: 1fr;
        place-items: center;
        width: 44px;
        height: 44px;
        padding: 0;
        border: 1px solid #e36f21;
        border-radius: 8px;
        background: #f47a21;
        color: #ffffff;
        box-shadow: 0 14px 34px rgba(164, 74, 49, 0.24);
        cursor: pointer;
      }
      #${BUTTON_ID}:hover {
        border-color: #d86118;
        background: #e96c18;
        color: #ffffff;
        transform: translateY(-1px);
      }
      #${BUTTON_ID}:focus-visible {
        outline: 2px solid rgba(244, 122, 33, 0.62);
        outline-offset: 3px;
      }
      #${BUTTON_ID} svg {
        width: 22px;
        height: 22px;
      }
      #${BUTTON_ID} span {
        position: absolute;
        top: -7px;
        right: -7px;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 999px;
        border: 1px solid rgba(244, 122, 33, 0.42);
        background: #ffffff;
        color: #d86118;
        font: 700 11px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${BUTTON_ID} span:empty {
        display: none;
      }
    `;
    document.documentElement.append(style);
  }

  function openFeed(feed) {
    chrome.runtime.sendMessage({
      type: "FEEDLENS_OPEN_DISCOVERED_FEED",
      feedUrl: feed.url,
      pageUrl: location.href,
      title: feed.title
    });
  }

  function notifyBackground(feeds) {
    chrome.runtime.sendMessage({
      type: "FEEDLENS_DISCOVERED_FEEDS",
      pageUrl: location.href,
      feeds
    }).catch(() => {
      // The page icon still works even if the service worker is asleep or reloading.
    });
  }

  function init() {
    const feeds = discoverFeeds();
    if (!feeds.length) return;
    mountButton(feeds);
    notifyBackground(feeds);
  }

  init();
})();
