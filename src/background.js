if (typeof importScripts === "function") {
  importScripts("file-access.js");
}

const FEED_URL_PATTERN = /(?:[?&](?:feed|format)=(?:rss|atom)|(?:^|\/)(?:feed|rss|atom|index\.xml|feed\.xml|rss\.xml|atom\.xml)(?:[?#/]|$)|\.(?:rss|xml|atom|opml)(?:[?#]|$))/i;
const FEED_CONTENT_TYPE_PATTERN = /^(?:application|text)\/(?:rss\+xml|atom\+xml|rdf\+xml|feed\+xml|xml|x-opml|opml\+xml)$/i;
const NON_FEED_RESOURCE_EXT_PATTERN = /\.(?:css|js|mjs|map|wasm|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp3|mp4|webm|wav|ogg|aac|m3u8|mpd|ts|flv|mov|avi|mkv|pdf|zip|gz|br|tar|7z|rar|bz2|xz|apk|dmg|exe|json|jsonld|yaml|yml|toml|txt|csv|tsv|md|markdown|docx?|xlsx?|pptx?|xsd|dtd|wsdl|kml|kmz|gpx|xlf|xliff)(?:$|[?#])/i;
const NON_FEED_XML_PATTERN = /(?:^|\/|_)sitemap(?:[\-_][^/]+)?\.xml$|(?:\/|^)(?:pom|build|web|package|androidmanifest|crossdomain|clientaccesspolicy|plugin|ivy|logback|log4j2?|testng|phpunit|coverage)\.xml$/i;
const SOCIAL_OR_WEB_FEED_HOSTS = new Set([
  "linkedin.com",
  "www.linkedin.com",
  "facebook.com",
  "www.facebook.com",
  "tiktok.com",
  "www.tiktok.com",
  "instagram.com",
  "www.instagram.com"
]);

const discoveredFeedsByTab = new Map();
const mainFrameContentTypeByTab = new Map();

if (typeof chrome !== "undefined" && chrome.tabs && chrome.webRequest) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "loading") {
      clearDiscoveredFeeds(tabId);
      mainFrameContentTypeByTab.delete(tabId);
    }

    if (changeInfo.status !== "complete" || !tab.url) {
      return;
    }

    const recordedContentType = mainFrameContentTypeByTab.get(tabId);
    if (recordedContentType && !isFeedContentType(recordedContentType)) {
      return;
    }

    if (!shouldTryReader(tab.url)) {
      return;
    }

    openReader(tabId, tab.url);
  });

  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      if (details.tabId >= 0) {
        const contentType = responseHeader(details.responseHeaders, "content-type");
        mainFrameContentTypeByTab.set(details.tabId, contentType);
      }
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
    mainFrameContentTypeByTab.delete(tabId);
  });
}

function shouldTryReader(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "chrome-extension:") return false;
    if (shouldBypassReader(url)) return false;
    if (isSourceBrowserPage(parsed)) return false;
    if (isNonFeedResourceUrl(parsed)) return false;
    if (isNonFeedXmlDocument(parsed)) return false;
    if (isSocialOrWebFeedUrl(parsed)) return false;

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
  if (isNonFeedXmlDocument(parsed)) return false;
  if (isSocialOrWebFeedUrl(parsed)) return false;

  const contentType = responseHeader(details.responseHeaders, "content-type");
  return isFeedContentType(contentType);
}

function isFeedContentType(contentType) {
  if (!contentType || typeof contentType !== "string") return false;
  const mimeType = contentType.split(";", 1)[0].trim().toLowerCase();
  return FEED_CONTENT_TYPE_PATTERN.test(mimeType);
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
  if (typeof chrome === "undefined" || !chrome.runtime?.getURL) return false;
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
  const host = parsed.hostname.toLowerCase();
  if (!host.includes("rsshub")) return false;
  if (host.startsWith("docs.") || host === "docs.rsshub.app") return false;
  if (/^\/(?:docs|guide|routes|joinus|faq|about|support|api-reference)(?:\/|$)/i.test(parsed.pathname)) return false;
  return parsed.pathname !== "/";
}

function isSourceBrowserPage(parsed) {
  const host = parsed.hostname.toLowerCase();
  const parts = parsed.pathname.split("/").filter(Boolean);
  const sourceViews = new Set(["blob", "blame", "tree", "src", "raw"]);
  if (
    (host === "github.com" || host === "gitlab.com" || host === "gitee.com" || host === "codeberg.org" || host.includes("gitlab") || host.includes("gitea")) &&
    parts.some((part) => sourceViews.has(part))
  ) {
    return true;
  }
  return false;
}

function isNonFeedResourceUrl(parsed) {
  return NON_FEED_RESOURCE_EXT_PATTERN.test(parsed.pathname);
}

function isNonFeedXmlDocument(parsed) {
  return NON_FEED_XML_PATTERN.test(parsed.pathname);
}

function isSocialOrWebFeedUrl(parsed) {
  const host = parsed.hostname.toLowerCase();
  return SOCIAL_OR_WEB_FEED_HOSTS.has(host) && /^\/(?:feed|home|explore|following|for-you)(?:\/|$)/i.test(parsed.pathname);
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
  mainFrameContentTypeByTab.delete(tabId);

  try {
    await chrome.action.setBadgeText({ tabId, text: "" });
    await chrome.action.setTitle({ tabId, title: "FeedLens" });
  } catch {
    // Some tab states cannot be updated while navigation is in progress.
  }
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    FEED_URL_PATTERN,
    FEED_CONTENT_TYPE_PATTERN,
    NON_FEED_RESOURCE_EXT_PATTERN,
    NON_FEED_XML_PATTERN,
    isFeedContentType,
    shouldTryReader,
    shouldTryReaderByHeaders,
    isNonFeedResourceUrl,
    isNonFeedXmlDocument,
    isSocialOrWebFeedUrl,
    isLikelyRssHubRoute,
    isSourceBrowserPage,
    isHttpUrl,
    isReaderUrl,
    shouldBypassReader,
    mainFrameContentTypeByTab
  };
}
