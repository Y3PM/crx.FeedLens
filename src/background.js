importScripts("file-access.js");

const FEED_URL_PATTERN = /(?:[?&](?:feed|format)=(?:rss|atom)|(?:^|\/)(?:feed|rss|atom|index\.xml|feed\.(?:xml|html?)|rss\.(?:xml|html?)|atom\.(?:xml|html?))(?:[?#/]|$)|\.(?:rss|xml|atom|opml)(?:[?#]|$))/i;
const FEED_CONTENT_TYPE_PATTERN = /(?:application|text)\/(?:rss\+xml|atom\+xml|rdf\+xml|xml|x-opml|opml\+xml)|\bxml\b/i;
const NON_FEED_RESOURCE_EXT_PATTERN = /\.(?:css|js|mjs|map|wasm|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp3|mp4|webm|pdf|zip|gz|br)(?:$|[?#])/i;
const discoveredFeedsByTab = new Map();

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    clearDiscoveredFeeds(tabId);
  }

  if (changeInfo.status !== "complete" || !tab.url || !shouldTryReader(tab.url)) {
    return;
  }

  openReader(tabId, tab.url);
});

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!shouldTryReaderByHeaders(details)) return;
    openReader(details.tabId, details.url);
  },
  {
    urls: ["http://*/*", "https://*/*"],
    types: ["main_frame"]
  },
  ["responseHeaders"]
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "FEEDLENS_OPEN_FILE_ACCESS_SETTINGS") {
    openFileAccessSettings(sender.tab?.windowId)
      .then((success) => sendResponse({ success }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }

  if (!sender.tab?.id || !message || typeof message !== "object") return;

  if (message.type === "FEEDLENS_DISCOVERED_FEEDS") {
    rememberDiscoveredFeeds(sender.tab.id, message.feeds);
    return;
  }

  if (message.type === "FEEDLENS_OPEN_DISCOVERED_FEED" && message.feedUrl) {
    openReader(sender.tab.id, message.feedUrl, {
      openInNewTab: message.openInNewTab,
      openerTab: sender.tab
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  const firstFeed = discoveredFeedsByTab.get(tab.id)?.[0];
  if (firstFeed?.url) {
    openReader(tab.id, firstFeed.url);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  discoveredFeedsByTab.delete(tabId);
});

function shouldTryReader(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "chrome-extension:") return false;
    if (shouldBypassReader(url)) return false;
    if (isSourceBrowserPage(parsed)) return false;

    return (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "file:") &&
      (FEED_URL_PATTERN.test(parsed.pathname + parsed.search) || isLikelyRssHubRoute(parsed));
  } catch {
    return false;
  }
}

function shouldTryReaderByHeaders(details) {
  if (details.tabId < 0 || !details.url || !isHttpUrl(details.url)) return false;
  if (isReaderUrl(details.url)) return false;
  if (shouldBypassReader(details.url)) return false;
  if (details.statusCode >= 400) return false;

  const parsed = new URL(details.url);
  if (isSourceBrowserPage(parsed)) return false;
  if (isNonFeedResourceUrl(parsed)) return false;

  const contentType = responseHeader(details.responseHeaders, "content-type");
  return FEED_CONTENT_TYPE_PATTERN.test(contentType);
}

function responseHeader(headers = [], name) {
  const match = headers.find((header) => header.name?.toLowerCase() === name);
  return match?.value || "";
}

function isHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isReaderUrl(url) {
  return url.startsWith(chrome.runtime.getURL("src/reader.html"));
}

function shouldBypassReader(url) {
  try {
    const parsed = new URL(url);
    return hasReaderBypassHash(parsed.hash) && parsed.protocol !== "file:";
  } catch {
    return false;
  }
}

function hasReaderBypassHash(hash) {
  return /(?:^|[?&])feedlens=0(?:[&#]|$)/.test(hash.replace(/^#/, ""));
}

function isLikelyRssHubRoute(parsed) {
  return parsed.hostname.toLowerCase().includes("rsshub") && parsed.pathname !== "/";
}

function isSourceBrowserPage(parsed) {
  const host = parsed.hostname.toLowerCase();
  const parts = parsed.pathname.split("/").filter(Boolean);
  const sourceViews = new Set(["blob", "blame", "tree"]);
  if (host === "github.com" && parts.some((part) => sourceViews.has(part))) return true;
  if (host === "gitlab.com" && parts.includes("-") && parts.some((part) => sourceViews.has(part))) return true;
  return false;
}

function isNonFeedResourceUrl(parsed) {
  return NON_FEED_RESOURCE_EXT_PATTERN.test(parsed.pathname);
}

async function openReader(tabId, url, options = {}) {
  try {
    const readerUrl = chrome.runtime.getURL(`src/reader.html?feed=${encodeURIComponent(url)}`);
    if (options.openInNewTab) {
      const createProperties = {
        url: readerUrl,
        active: true,
        openerTabId: tabId
      };
      if (typeof options.openerTab?.windowId === "number") {
        createProperties.windowId = options.openerTab.windowId;
      }
      if (typeof options.openerTab?.index === "number") {
        createProperties.index = options.openerTab.index + 1;
      }

      await chrome.tabs.create(createProperties);
      return;
    }

    await chrome.tabs.update(tabId, { url: readerUrl });
  } catch {
    // Some browser pages cannot be updated. Ordinary web RSS pages are handled.
  }
}

async function openFileAccessSettings(windowId) {
  const createProperties = {
    url: globalThis.FeedLensFileAccess.extensionSettingsUrl(chrome.runtime),
    active: true
  };
  if (typeof windowId === "number") {
    createProperties.windowId = windowId;
  }

  try {
    await chrome.tabs.create(createProperties);
    return true;
  } catch {
    if (!Object.prototype.hasOwnProperty.call(createProperties, "windowId")) return false;
    delete createProperties.windowId;
    try {
      await chrome.tabs.create(createProperties);
      return true;
    } catch {
      return false;
    }
  }
}

async function rememberDiscoveredFeeds(tabId, feeds) {
  const cleanFeeds = Array.isArray(feeds)
    ? feeds.filter((feed) => feed?.url && isHttpUrl(feed.url)).slice(0, 20)
    : [];

  if (!cleanFeeds.length) return;
  discoveredFeedsByTab.set(tabId, cleanFeeds);

  try {
    await chrome.action.setBadgeText({ tabId, text: "RSS" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#F26522" });
    await chrome.action.setTitle({ tabId, title: "Open RSS with FeedLens" });
  } catch {
    // Browser action state is a nice signal, but the page icon remains the primary entry.
  }
}

async function clearDiscoveredFeeds(tabId) {
  discoveredFeedsByTab.delete(tabId);

  try {
    await chrome.action.setBadgeText({ tabId, text: "" });
    await chrome.action.setTitle({ tabId, title: "FeedLens" });
  } catch {
    // Some tab states cannot be updated while navigation is in progress.
  }
}
