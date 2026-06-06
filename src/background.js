const FEED_URL_PATTERN = /(?:[?&](?:feed|format)=(?:rss|atom)|\.(?:rss|xml|atom|opml)(?:[?#]|$))/i;
const FEED_CONTENT_TYPE_PATTERN = /(?:application|text)\/(?:rss\+xml|atom\+xml|rdf\+xml|xml|x-opml|opml\+xml)|\bxml\b/i;
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

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!sender.tab?.id || !message || typeof message !== "object") return;

  if (message.type === "FEEDLENS_DISCOVERED_FEEDS") {
    rememberDiscoveredFeeds(sender.tab.id, message.feeds);
    return;
  }

  if (message.type === "FEEDLENS_OPEN_DISCOVERED_FEED" && message.feedUrl) {
    openReader(sender.tab.id, message.feedUrl);
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
  if (isSourceBrowserPage(new URL(details.url))) return false;

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
    return parsed.hash.startsWith("#feedlens=0") && parsed.protocol !== "file:";
  } catch {
    return false;
  }
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

async function openReader(tabId, url) {
  try {
    const readerUrl = chrome.runtime.getURL(`src/reader.html?feed=${encodeURIComponent(url)}`);
    await chrome.tabs.update(tabId, { url: readerUrl });
  } catch {
    // Some browser pages cannot be updated. Ordinary web RSS pages are handled.
  }
}

async function rememberDiscoveredFeeds(tabId, feeds) {
  const cleanFeeds = Array.isArray(feeds)
    ? feeds.filter((feed) => feed?.url && isHttpUrl(feed.url)).slice(0, 20)
    : [];

  if (!cleanFeeds.length) return;
  discoveredFeedsByTab.set(tabId, cleanFeeds);

  try {
    await chrome.action.setBadgeText({ tabId, text: cleanFeeds.length > 1 ? String(cleanFeeds.length) : "RSS" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#A44A31" });
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
