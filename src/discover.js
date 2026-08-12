(() => {
  if (globalThis.__feedLensDiscoverBootstrapped) return;
  globalThis.__feedLensDiscoverBootstrapped = true;

  const BUTTON_ID = "feedlens-discover-button";
  const MENU_ID = "feedlens-discover-menu";
  const STYLE_ID = "feedlens-discover-style";

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
    return globalThis.FeedLensFeedDiscovery.isCanonicalFeedLink({
      rel: link.getAttribute("rel"),
      type: link.getAttribute("type"),
      href: link.getAttribute("href")
    });
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
    return globalThis.FeedLensFeedDiscovery.isDeclaredFeedAnchor({
      href: anchor.getAttribute("href"),
      text: anchor.textContent,
      ariaLabel: anchor.getAttribute("aria-label"),
      title: anchor.getAttribute("title"),
      className: anchor.className,
      id: anchor.id
    });
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
    mountFloatingButton(feeds);
  }

  function mountFloatingButton(feeds) {
    if (!feeds.length || document.getElementById(BUTTON_ID)) return;

    const button = createFeedButton(feeds);
    button.id = BUTTON_ID;
    document.documentElement.append(button);
  }

  function createFeedButton(feeds) {
    const button = document.createElement("button");
    button.type = "button";
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
        transition: border-color 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
      }
      #${BUTTON_ID}:hover {
        border-color: #e65a1a;
        background: #e65a1a;
        color: #ffffff;
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
      @media (prefers-reduced-motion: reduce) {
        #${BUTTON_ID} {
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
      title: feed.title,
      openInNewTab: true
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
