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
  const FEED_HREF_PATTERN = /(?:^|\/)(?:feed|rss|atom|index\.xml|feed\.(?:xml|html?)|rss\.(?:xml|html?)|atom\.(?:xml|html?)|\.rss|\.atom|\.opml)(?:[?#/]|$)/i;
  const RSS_LABEL_PATTERN = /\b(rss|atom|feed|subscribe)\b|订阅|订阅源/i;
  const BUTTON_ID = "feedlens-discover-button";
  const MENU_ID = "feedlens-discover-menu";
  const STYLE_ID = "feedlens-discover-style";
  const INLINE_CLASS = "feedlens-discover-inline";
  const ENHANCED_CLASS = "feedlens-discover-enhanced";

  function discoverFeeds() {
    const linkCandidates = [...document.querySelectorAll("link[href]")]
      .filter(isFeedLink)
      .map(feedFromLink)
      .filter(Boolean);

    const anchorCandidates = [...document.querySelectorAll("a[href]")]
      .filter(isFeedAnchor)
      .map(feedFromAnchor)
      .filter(Boolean);

    return uniqueFeeds(linkCandidates.concat(anchorCandidates));
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

  function isFeedAnchor(anchor) {
    const href = anchor.getAttribute("href") || "";
    if (!href || href.startsWith("#")) return false;

    const label = normalize([
      anchor.getAttribute("aria-label"),
      anchor.getAttribute("title"),
      anchor.textContent,
      anchor.querySelector("img")?.getAttribute("alt")
    ].filter(Boolean).join(" "));
    const hasIcon = Boolean(anchor.querySelector("svg, img, use")) || /rss|feed|atom/i.test(String(anchor.className || ""));

    return FEED_HREF_PATTERN.test(href) || (RSS_LABEL_PATTERN.test(label) && hasIcon);
  }

  function feedFromAnchor(anchor) {
    try {
      const url = new URL(anchor.getAttribute("href"), document.baseURI).href;
      const title = normalize(anchor.getAttribute("title")) ||
        normalize(anchor.getAttribute("aria-label")) ||
        normalize(anchor.textContent) ||
        normalize(document.title) ||
        url;
      return { url, title, type: "" };
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

  function mountDiscoveryEntry(feeds) {
    if (!feeds.length) return;
    injectStyle();

    const existing = findExistingRssElement(feeds);
    if (existing && enhanceExistingRssElement(existing, feeds)) {
      removeInsertedDiscoveryButtons();
      return;
    }

    const anchor = findInlineInsertionAnchor();
    if (anchor && mountInlineButton(feeds, anchor)) return;

    mountFloatingButton(feeds);
  }

  function findExistingRssElement(feeds) {
    const feedUrls = new Set(feeds.map((feed) => feed.url));
    const candidates = [...document.querySelectorAll("a[href]")]
      .map((element) => ({ element, score: rssElementScore(element, feedUrls) }))
      .filter((candidate) => candidate.score > 0)
      .filter((candidate) => isVisibleElement(candidate.element))
      .sort((a, b) => b.score - a.score);

    return candidates[0]?.element || null;
  }

  function rssElementScore(element, feedUrls) {
    const href = absoluteHref(element);
    const label = normalize([
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.textContent,
      element.querySelector("img")?.getAttribute("alt")
    ].filter(Boolean).join(" "));
    const className = String(element.className || "");
    const hasIcon = Boolean(element.querySelector("svg, img, use")) || /rss|feed|atom/i.test(className);
    const compact = isCompactElement(element);

    if (href && feedUrls.has(href)) return compact || hasIcon ? 100 : 70;
    if (href && FEED_HREF_PATTERN.test(href)) return compact || hasIcon ? 80 : 45;
    if (RSS_LABEL_PATTERN.test(label) && (hasIcon || compact)) return 55;
    return 0;
  }

  function enhanceExistingRssElement(element, feeds) {
    if (element.classList.contains(ENHANCED_CLASS)) return true;
    const feed = feedForElement(element, feeds);

    element.classList.add(ENHANCED_CLASS);
    if (isAnimatedRssEntry(element)) {
      element.classList.add("feedlens-discover-enhanced-icon");
      if (getComputedStyle(element).display === "inline") {
        element.classList.add("feedlens-discover-enhanced-inline");
      }
    }
    element.title = feeds.length > 1 ? "Choose RSS feed with FeedLens" : "Open RSS with FeedLens";
    element.setAttribute("aria-label", element.getAttribute("aria-label") || element.title);
    element.addEventListener("click", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      openFeedPicker(preferredFeeds(feeds, feed), element);
    });
    return true;
  }

  function isAnimatedRssEntry(element) {
    if (element.querySelector("svg, img")) return true;
    const className = String(element.className || "");
    const text = normalize(element.textContent);
    if (/rss|feed|atom/i.test(className) && text.length <= 12) return true;
    return text.length <= 12 && /^(rss|atom|feed|订阅|订阅\s*rss|rss\s*订阅)$/i.test(text);
  }

  function feedForElement(element, feeds) {
    const href = absoluteHref(element);
    return feeds.find((feed) => feed.url === href) || feeds[0];
  }

  function findInlineInsertionAnchor() {
    const selectors = [
      "header nav",
      "header nav ul",
      "header nav ol",
      "header [role='navigation']",
      "nav",
      "nav ul",
      "nav ol",
      "[role='navigation']",
      "header",
      ".site-header",
      ".navbar",
      ".nav",
      ".menu",
      ".social",
      ".social-links"
    ];

    return selectors
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter(isVisibleElement)
      .filter(canAcceptInlineButton)
      .sort((a, b) => insertionScore(b) - insertionScore(a))[0] || null;
  }

  function canAcceptInlineButton(element) {
    if (element.closest(`#${BUTTON_ID}, .${INLINE_CLASS}, .${ENHANCED_CLASS}`)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 20 || rect.height > 160) return false;
    const links = element.querySelectorAll("a, button").length;
    return links > 0 || ["NAV", "HEADER", "UL", "OL"].includes(element.tagName);
  }

  function insertionScore(element) {
    const tag = element.tagName;
    const className = String(element.className || "");
    let score = 0;
    if (tag === "NAV") score += 40;
    if (element.closest("header")) score += 35;
    if (/social|share|follow/i.test(className)) score += 25;
    if (/nav|menu|navbar/i.test(className)) score += 20;
    score += Math.min(element.querySelectorAll("a, button").length, 8);
    return score;
  }

  function mountInlineButton(feeds, anchor) {
    if (document.querySelector(`.${INLINE_CLASS}`)) return true;
    const button = createFeedButton(feeds, INLINE_CLASS);
    if (anchor.matches("ul, ol")) {
      const item = document.createElement("li");
      item.className = "feedlens-discover-item";
      item.append(button);
      anchor.append(item);
      return true;
    }

    anchor.append(button);
    return true;
  }

  function mountFloatingButton(feeds) {
    if (!feeds.length || document.getElementById(BUTTON_ID)) return;

    const button = createFeedButton(feeds, "");
    button.id = BUTTON_ID;
    document.documentElement.append(button);
  }

  function removeInsertedDiscoveryButtons() {
    document.getElementById(BUTTON_ID)?.remove();
    document.querySelectorAll(`.${INLINE_CLASS}`).forEach((button) => {
      const item = button.closest(".feedlens-discover-item");
      if (item && item.children.length === 1) {
        item.remove();
        return;
      }
      button.remove();
    });
  }

  function createFeedButton(feeds, className) {
    const button = document.createElement("button");
    button.type = "button";
    if (className) button.className = className;
    button.title = feeds.length > 1 ? "Choose RSS feed with FeedLens" : "Open RSS with FeedLens";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = `
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 17C5.2091 17 7 18.7909 7 21H3V17ZM3 10C9.0751 10 14 14.9249 14 21H12C12 16.0294 7.9706 12 3 12V10ZM3 3C12.9411 3 21 11.0589 21 21H19C19 12.1634 11.8366 5 3 5V3Z"></path>
      </svg>
    `;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openFeedPicker(feeds, button);
    });
    return button;
  }

  function preferredFeeds(feeds, preferredFeed) {
    if (!preferredFeed) return feeds;
    return [preferredFeed].concat(feeds.filter((feed) => feed.url !== preferredFeed.url));
  }

  function openFeedPicker(feeds, trigger) {
    closeFeedPicker();
    if (feeds.length <= 1) {
      openFeed(feeds[0]);
      return;
    }

    const menu = document.createElement("div");
    menu.id = MENU_ID;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Choose RSS feed");

    const heading = document.createElement("div");
    heading.className = "feedlens-discover-menu-heading";
    heading.textContent = "Choose feed";
    menu.append(heading);

    feeds.slice(0, 12).forEach((feed) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "feedlens-discover-menu-item";
      item.setAttribute("role", "menuitem");

      const title = document.createElement("span");
      title.className = "feedlens-discover-menu-title";
      title.textContent = feed.title || feed.url;

      const url = document.createElement("span");
      url.className = "feedlens-discover-menu-url";
      url.textContent = compactFeedUrl(feed.url);

      item.append(title, url);
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeFeedPicker();
        openFeed(feed);
      });
      menu.append(item);
    });

    menu.addEventListener("click", (event) => event.stopPropagation());
    document.documentElement.append(menu);
    positionFeedPicker(menu, trigger);
    window.setTimeout(() => {
      document.addEventListener("click", closeFeedPicker, { once: true });
      document.addEventListener("keydown", closeFeedPickerOnEscape, { once: true });
    }, 0);
  }

  function closeFeedPickerOnEscape(event) {
    if (event.key !== "Escape") {
      document.addEventListener("keydown", closeFeedPickerOnEscape, { once: true });
      return;
    }
    closeFeedPicker();
  }

  function closeFeedPicker() {
    document.getElementById(MENU_ID)?.remove();
  }

  function positionFeedPicker(menu, trigger) {
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 260;
    const gap = 8;
    const menuHeight = menu.offsetHeight || 220;
    const left = Math.min(
      Math.max(12, rect.left),
      Math.max(12, window.innerWidth - menuWidth - 12)
    );
    const top = rect.bottom + gap < window.innerHeight - 140
      ? rect.bottom + gap
      : Math.max(12, rect.top - menuHeight - gap);

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function compactFeedUrl(value) {
    try {
      const url = new URL(value);
      return `${url.hostname}${url.pathname}`;
    } catch {
      return value;
    }
  }

  function absoluteHref(element) {
    try {
      return new URL(element.getAttribute("href") || "", document.baseURI).href;
    } catch {
      return "";
    }
  }

  function isVisibleElement(element) {
    if (!hasVisibleStyle(element)) return false;
    if (hasVisibleBox(element)) return true;
    return [...element.querySelectorAll("svg, img, use")]
      .some((child) => hasVisibleStyle(child) && hasVisibleBox(child));
  }

  function isCompactElement(element) {
    const rect = element.getBoundingClientRect();
    return rect.width <= 160 && rect.height <= 80;
  }

  function hasVisibleStyle(element) {
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
  }

  function hasVisibleBox(element) {
    return [...element.getClientRects()].some((rect) => rect.width >= 1 && rect.height >= 1);
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
        border: 1px solid #b54f2e;
        border-radius: 8px;
        background: #b54f2e;
        color: #ffffff;
        box-shadow: 0 14px 34px rgba(181, 79, 46, 0.26);
        cursor: pointer;
        animation: feedlens-discover-spin-rest 6.8s ease-in-out 0.8s infinite;
        transition: border-color 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
      }
      #${BUTTON_ID}:hover {
        border-color: #9f3f26;
        background: #9f3f26;
        color: #ffffff;
        animation-play-state: paused;
        transform: translateY(-1px);
      }
      #${BUTTON_ID}:focus-visible {
        outline: 2px solid rgba(181, 79, 46, 0.52);
        outline-offset: 3px;
      }
      #${BUTTON_ID} svg {
        width: 22px;
        height: 22px;
      }
      .${INLINE_CLASS},
      .${ENHANCED_CLASS} {
        position: relative;
      }
      .feedlens-discover-item {
        display: inline-flex;
        align-items: center;
        list-style: none;
      }
      .${INLINE_CLASS} {
        display: inline-grid;
        place-items: center;
        width: 30px;
        height: 30px;
        margin-inline-start: 8px;
        padding: 0;
        border: 1px solid rgba(181, 79, 46, 0.28);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.78);
        color: #b54f2e;
        font: inherit;
        vertical-align: middle;
        cursor: pointer;
        animation: feedlens-discover-spin-rest 6.8s ease-in-out 0.8s infinite;
        transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
      }
      .${INLINE_CLASS}:hover,
      .${ENHANCED_CLASS}:hover {
        animation-play-state: paused;
        color: #9f3f26;
        transform: translateY(-1px);
      }
      .${INLINE_CLASS}:hover {
        border-color: rgba(181, 79, 46, 0.52);
        background: #ffffff;
      }
      .${INLINE_CLASS}:focus-visible,
      .${ENHANCED_CLASS}:focus-visible {
        outline: 2px solid rgba(181, 79, 46, 0.52);
        outline-offset: 3px;
      }
      .${INLINE_CLASS} svg {
        width: 17px;
        height: 17px;
      }
      .${ENHANCED_CLASS} {
        transition: color 0.16s ease, transform 0.16s ease, filter 0.16s ease;
      }
      .feedlens-discover-enhanced-inline {
        display: inline-block;
        vertical-align: middle;
      }
      .feedlens-discover-enhanced-icon {
        transform-origin: center;
        animation: feedlens-discover-spin-rest 6.8s ease-in-out 0.8s infinite;
      }
      .${ENHANCED_CLASS}:hover {
        filter: drop-shadow(0 4px 10px rgba(181, 79, 46, 0.18));
      }
      #${MENU_ID} {
        position: fixed;
        z-index: 2147483647;
        display: grid;
        width: 260px;
        max-width: calc(100vw - 24px);
        padding: 8px;
        border: 1px solid rgba(34, 38, 42, 0.14);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.96);
        color: #211d19;
        box-shadow: 0 18px 42px rgba(42, 34, 27, 0.16);
        font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        backdrop-filter: blur(18px);
      }
      .feedlens-discover-menu-heading {
        padding: 4px 8px 8px;
        color: #6b6f73;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .feedlens-discover-menu-item {
        display: grid;
        gap: 2px;
        width: 100%;
        min-height: 44px;
        padding: 8px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .feedlens-discover-menu-item:hover,
      .feedlens-discover-menu-item:focus-visible {
        outline: 0;
        background: rgba(181, 79, 46, 0.1);
        color: #9f3f26;
      }
      .feedlens-discover-menu-title,
      .feedlens-discover-menu-url {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .feedlens-discover-menu-title {
        font-weight: 700;
      }
      .feedlens-discover-menu-url {
        color: #6b6f73;
        font-size: 11px;
      }
      @keyframes feedlens-discover-spin-rest {
        0%, 68%, 100% {
          transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
          box-shadow: 0 0 0 0 rgba(181, 79, 46, 0);
          filter: saturate(1);
        }
        72% {
          transform: translate3d(0, -1px, 0) rotate(0deg) scale(1.06);
          box-shadow: 0 0 0 5px rgba(181, 79, 46, 0.1);
          filter: saturate(1.12);
        }
        82% {
          transform: translate3d(0, -1px, 0) rotate(360deg) scale(1.06);
          box-shadow: 0 8px 18px rgba(181, 79, 46, 0.18), 0 0 0 7px rgba(181, 79, 46, 0.12);
        }
        88% {
          transform: translate3d(0, 0, 0) rotate(360deg) scale(1);
          box-shadow: 0 0 0 0 rgba(181, 79, 46, 0);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        #${BUTTON_ID},
        .${INLINE_CLASS},
        .${ENHANCED_CLASS} {
          animation: none;
          transition: none;
        }
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
    mountDiscoveryEntry(feeds);
    notifyBackground(feeds);
  }

  function initAfterPageLoad() {
    if (document.readyState === "complete") {
      init();
      return;
    }

    window.addEventListener("load", init, { once: true });
  }

  initAfterPageLoad();
})();
