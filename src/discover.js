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
  const RSS_LABEL_PATTERN = /\b(rss|atom|feed)\b|订阅源|rss\s*订阅/i;
  const BUTTON_ID = "feedlens-discover-button";
  const MENU_ID = "feedlens-discover-menu";
  const STYLE_ID = "feedlens-discover-style";
  const BRAND_BUTTON_CLASS = "feedlens-discover-brand-button";

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
    const label = normalize(link.getAttribute("title"));
    return isAlternate && (isFeedType || RSS_LABEL_PATTERN.test(label) || FEED_HREF_PATTERN.test(href));
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
    const hasFeedIcon = /rss|feed|atom/i.test([
      anchor.className,
      anchor.id,
      anchor.querySelector("svg, img, use")?.getAttribute("class"),
      anchor.querySelector("img")?.getAttribute("src"),
      anchor.querySelector("img")?.getAttribute("alt"),
      anchor.querySelector("use")?.getAttribute("href"),
      anchor.querySelector("use")?.getAttribute("xlink:href")
    ].filter(Boolean).join(" "));
    const hasFeedLabel = RSS_LABEL_PATTERN.test(label);

    return (FEED_HREF_PATTERN.test(href) && (hasFeedLabel || hasFeedIcon)) || (hasFeedLabel && hasFeedIcon);
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

    const anchor = findBrandAnchor();
    if (anchor && mountBrandButton(feeds, anchor.element, anchor.kind)) return;

    mountFloatingButton(feeds);
  }

  function findBrandAnchor() {
    const selectors = [
      "header a[class*='logo' i]",
      "header a[id*='logo' i]",
      "header [class*='logo' i]",
      "header [id*='logo' i]",
      "header img",
      "a[class*='logo' i]",
      "a[id*='logo' i]",
      "[class*='avatar' i]",
      "[class*='site-title' i]",
      "[class*='brand' i]",
      "[class*='logo' i]",
      "[id*='logo' i]",
      "header h1",
      "main h1",
      "h1"
    ];

    const seen = new Set();
    const candidates = selectors
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .map((element) => brandAnchorCandidate(element))
      .filter(Boolean)
      .filter((candidate) => {
        if (seen.has(candidate.element)) return false;
        seen.add(candidate.element);
        return true;
      })
      .filter((candidate) => isVisibleElement(candidate.element))
      .filter((candidate) => canHostBrandButton(candidate.element))
      .sort((a, b) => b.score - a.score);

    return candidates[0] || null;
  }

  function brandAnchorCandidate(element) {
    if (element.matches("img, svg")) {
      const parent = element.closest("a, h1, [class*='logo' i], [id*='logo' i], header");
      return parent && parent !== element ? brandAnchorCandidate(parent) : null;
    }

    const kind = brandAnchorKind(element);
    return { element, kind, score: brandAnchorScore(element, kind) };
  }

  function brandAnchorKind(element) {
    const className = String(element.className || "");
    const id = String(element.id || "");
    if (/logo|avatar|brand/i.test(`${className} ${id}`) || element.querySelector("img, svg")) return "logo";
    return "title";
  }

  function brandAnchorScore(element, kind) {
    const tag = element.tagName;
    const className = String(element.className || "");
    const id = String(element.id || "");
    let score = 0;
    if (kind === "logo") score += 90;
    if (tag === "H1") score += 55;
    if (element.closest("header")) score += 60;
    if (tag === "A") score += 30;
    if (/logo/i.test(className) || /logo/i.test(id)) score += 55;
    if (/brand|site-title|site_title|title/i.test(className) || /brand|site-title|site_title|title/i.test(id)) score += 35;
    if (element.querySelector("img, svg")) score += 20;
    if (normalize(element.textContent).length > 0) score += 10;
    return score;
  }

  function canHostBrandButton(element) {
    if (element.closest(`#${BUTTON_ID}, .${BRAND_BUTTON_CLASS}`)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 32 || rect.height < 18 || rect.width > window.innerWidth * 0.92) return false;
    if (rect.height > Math.max(180, window.innerHeight * 0.35)) return false;
    if (element.matches("input, textarea, select, button, iframe, video, canvas")) return false;
    if (element.tagName === "H1" && rect.width > Math.min(460, window.innerWidth * 0.72)) return false;
    return true;
  }

  function mountBrandButton(feeds, anchor, kind) {
    const existing = document.querySelector(`.${BRAND_BUTTON_CLASS}`);
    if (existing) {
      existing.remove();
    }

    const button = createFeedButton(feeds, BRAND_BUTTON_CLASS);
    button.dataset.feedlensPlacement = kind;
    document.documentElement.append(button);
    if (!positionBrandButton(button, anchor)) {
      button.remove();
      mountFloatingButton(feeds);
      return true;
    }
    window.addEventListener("resize", () => positionBrandButton(button, anchor), { passive: true });
    window.addEventListener("scroll", () => positionBrandButton(button, anchor), { passive: true });
    return true;
  }

  function positionBrandButton(button, anchor) {
    if (!document.documentElement.contains(button) || !document.documentElement.contains(anchor)) return false;

    const rect = anchor.getBoundingClientRect();
    const size = 24;
    const margin = 8;
    const gap = 8;

    button.hidden = rect.bottom < margin || rect.top > window.innerHeight - margin;
    if (button.hidden) return true;

    const hasLeftRoom = rect.left >= size + gap + margin;
    const hasRightRoom = rect.right + size + gap <= window.innerWidth - margin;
    if (!hasLeftRoom && !hasRightRoom) {
      button.hidden = true;
      return false;
    }

    let top = rect.top + rect.height / 2 - size / 2;
    let left = hasLeftRoom ? rect.left - size - gap : rect.right + gap;

    top = clamp(top, margin, window.innerHeight - size - margin);

    button.style.top = `${Math.round(top)}px`;
    button.style.left = `${Math.round(left)}px`;
    return true;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function mountFloatingButton(feeds) {
    if (!feeds.length || document.getElementById(BUTTON_ID)) return;

    const button = createFeedButton(feeds, "");
    button.id = BUTTON_ID;
    document.documentElement.append(button);
  }

  function createFeedButton(feeds, className) {
    const button = document.createElement("button");
    button.type = "button";
    if (className) button.className = className;
    button.title = feeds.length > 1 ? "Choose RSS feed with FeedLens" : "Open RSS with FeedLens";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = `
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 3C12.9411 3 21 11.0589 21 21H18C18 12.7157 11.2843 6 3 6V3ZM3 10C9.07513 10 14 14.9249 14 21H11C11 16.5817 7.41828 13 3 13V10ZM3 17C5.20914 17 7 18.7909 7 21H3V17Z"></path>
      </svg>
    `;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openFeedPicker(feeds, button);
    });
    return button;
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

  function isVisibleElement(element) {
    if (!hasVisibleStyle(element)) return false;
    if (hasVisibleBox(element)) return true;
    return [...element.querySelectorAll("svg, img, use")]
      .some((child) => hasVisibleStyle(child) && hasVisibleBox(child));
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
        border: 1px solid #f26522;
        border-radius: 8px;
        background: #f26522;
        color: #ffffff;
        box-shadow: 0 14px 34px rgba(242, 101, 34, 0.26);
        cursor: pointer;
        animation: feedlens-discover-spin-rest 6.8s ease-in-out 0.8s infinite;
        transition: border-color 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
      }
      #${BUTTON_ID}:hover {
        border-color: #e65a1a;
        background: #e65a1a;
        color: #ffffff;
        animation-play-state: paused;
        transform: translateY(-1px);
      }
      #${BUTTON_ID}:focus-visible {
        outline: 2px solid rgba(242, 101, 34, 0.52);
        outline-offset: 3px;
      }
      #${BUTTON_ID} svg {
        width: 22px;
        height: 22px;
      }
      .${BRAND_BUTTON_CLASS} {
        position: fixed;
        z-index: 2147483647;
        display: inline-grid;
        place-items: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border: 1px solid rgba(242, 101, 34, 0.22);
        border-radius: 999px;
        background: #f26522;
        color: #ffffff !important;
        box-shadow: 0 6px 16px rgba(242, 101, 34, 0.24), 0 1px 3px rgba(42, 34, 27, 0.18);
        font: 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
        animation: feedlens-discover-spin-rest 6.8s ease-in-out 0.8s infinite;
        transform-origin: center;
        transition: border-color 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease, color 0.16s ease, transform 0.16s ease;
      }
      .${BRAND_BUTTON_CLASS}:hover {
        border-color: rgba(230, 90, 26, 0.36);
        background: #e65a1a;
        color: #ffffff !important;
        animation-play-state: paused;
        transform: translateY(-1px);
        box-shadow: 0 8px 18px rgba(242, 101, 34, 0.28), 0 1px 4px rgba(42, 34, 27, 0.2);
      }
      .${BRAND_BUTTON_CLASS}:focus-visible {
        outline: 2px solid rgba(242, 101, 34, 0.52);
        outline-offset: 3px;
      }
      .${BRAND_BUTTON_CLASS} svg {
        width: 15px;
        height: 15px;
        transform: translate(0, -1px);
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
          box-shadow: 0 0 0 0 rgba(242, 101, 34, 0);
          filter: saturate(1);
        }
        72% {
          transform: translate3d(0, -1px, 0) rotate(0deg) scale(1.06);
          box-shadow: 0 0 0 5px rgba(242, 101, 34, 0.1);
          filter: saturate(1.12);
        }
        82% {
          transform: translate3d(0, -1px, 0) rotate(360deg) scale(1.06);
          box-shadow: 0 8px 18px rgba(242, 101, 34, 0.18), 0 0 0 7px rgba(242, 101, 34, 0.12);
        }
        88% {
          transform: translate3d(0, 0, 0) rotate(360deg) scale(1);
          box-shadow: 0 0 0 0 rgba(242, 101, 34, 0);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        #${BUTTON_ID},
        .${BRAND_BUTTON_CLASS} {
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
