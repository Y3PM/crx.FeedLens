(() => {
  if (globalThis.__feedLensRendered) return;
  if (globalThis.__feedLensBootstrapped) {
    globalThis.__feedLensTryInit?.();
    return;
  }
  globalThis.__feedLensBootstrapped = true;

  const RSS_NAMES = new Set(["rss", "rdf", "feed"]);
  const XML_CONTENT_TYPES = [
    "application/rss+xml",
    "application/atom+xml",
    "application/rdf+xml",
    "application/feed+xml",
    "application/xml",
    "text/rss+xml",
    "text/atom+xml",
    "text/xml"
  ];
  const SUBSCRIBE_READERS = [
    {
      id: "feedly",
      label: "Feedly",
      url: (feedUrl) => `https://feedly.com/i/subscription/feed%2F${encodeURIComponent(feedUrl)}`
    },
    {
      id: "inoreader",
      label: "Inoreader",
      url: (feedUrl) => `https://www.inoreader.com/feed/${encodeURIComponent(feedUrl)}`
    },
    {
      id: "newsblur",
      label: "NewsBlur",
      url: (feedUrl) => `https://www.newsblur.com/?url=${encodeURIComponent(feedUrl)}`
    },
    {
      id: "feedbin",
      label: "Feedbin",
      url: (feedUrl) => `https://feedbin.com/?subscribe=${encodeURIComponent(feedUrl)}`
    },
    {
      id: "oldreader",
      label: "The Old Reader",
      url: (feedUrl) => `https://theoldreader.com/feeds/subscribe?url=${encodeURIComponent(feedUrl)}`
    }
  ];

  const state = {
    feed: null,
    opml: null,
    selectedIndex: 0,
    readerCss: "",
    attempts: 0,
    listScrollTop: 0,
    listScrollLeft: 0,
    keydownBound: false,
    documentClickBound: false,
    sourceUrl: location.href
  };

  function htmlTemplate(value) {
    const htmlDoc = new DOMParser().parseFromString(`<template>${value || ""}</template>`, "text/html");
    return htmlDoc.querySelector("template");
  }

  function localName(node) {
    return (node?.localName || node?.nodeName || "").toLowerCase();
  }

  function localPart(name) {
    return name.split(":").pop().toLowerCase();
  }

  function elementChildren(node) {
    return [...(node?.children || [])];
  }

  function child(node, names) {
    const wanted = asArray(names).map(localPart);
    return elementChildren(node).find((element) => wanted.includes(localName(element))) || null;
  }

  function childByPriority(node, names, predicate = () => true) {
    for (const name of asArray(names)) {
      const wanted = localPart(name);
      const found = elementChildren(node).find((element) => localName(element) === wanted && predicate(element, name));
      if (found) return found;
    }
    return null;
  }

  function children(node, names) {
    const wanted = asArray(names).map(localPart);
    return elementChildren(node).filter((element) => wanted.includes(localName(element)));
  }

  function descendants(node, names) {
    const wanted = asArray(names).map(localPart);
    return [...(node?.getElementsByTagName("*") || [])].filter((element) => wanted.includes(localName(element)));
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [value];
  }

  function text(node, names) {
    for (const name of asArray(names)) {
      const found = child(node, name);
      if (found && found.textContent) return normalize(found.textContent);
    }
    return "";
  }

  function attr(node, names, attrName) {
    for (const name of asArray(names)) {
      const found = child(node, name);
      if (!found) continue;
      const value = found.getAttribute(attrName);
      if (value) return value.trim();
    }
    return "";
  }

  function normalize(value) {
    return value.replace(/\s+/g, " ").trim();
  }

  function absoluteUrl(value) {
    if (!value) return "";
    try {
      return new URL(value, state.sourceUrl || location.href).href;
    } catch {
      return value;
    }
  }

  function absoluteUrlFor(value, node) {
    if (!value) return "";
    try {
      return new URL(value, baseUrlFor(node)).href;
    } catch {
      return value;
    }
  }

  function baseUrlFor(node) {
    let current = node;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      const base = current.getAttribute("xml:base") || current.getAttribute("base");
      if (base) return absoluteUrl(base);
      current = current.parentElement;
    }
    return state.sourceUrl || location.href;
  }

  function stripHtml(value) {
    const template = htmlTemplate(value);
    return normalize(template.content.textContent || "");
  }

  function decodeEntities(value) {
    if (!value || !/[&][a-zA-Z#0-9]+;/.test(value)) return value || "";

    let decoded = value;
    for (let index = 0; index < 2; index += 1) {
      const textareaMarkup = decoded.replaceAll("</textarea", "&lt;/textarea");
      const htmlDoc = new DOMParser().parseFromString(`<textarea>${textareaMarkup}</textarea>`, "text/html");
      const textarea = htmlDoc.querySelector("textarea");
      const next = textarea.value || decoded;
      if (next === decoded || !/[&][a-zA-Z#0-9]+;/.test(next)) return next;
      decoded = next;
    }
    return decoded;
  }

  function safeHtml(value) {
    const template = htmlTemplate(value);
    normalizeFeedHtml(template);

    if (globalThis.DOMPurify?.sanitize) {
      return globalThis.DOMPurify.sanitize(template.innerHTML, {
        ALLOWED_TAGS: [
          "a", "abbr", "b", "blockquote", "br", "code", "div", "em", "figcaption",
          "figure", "h1", "h2", "h3", "h4", "hr", "i", "img", "li", "ol", "p",
          "pre", "s", "small", "span", "strong", "sub", "sup", "table", "tbody",
          "td", "tfoot", "th", "thead", "tr", "ul"
        ],
        ALLOWED_ATTR: [
          "alt", "colspan", "decoding", "height", "href", "loading", "referrerpolicy",
          "rel", "rowspan", "src", "target", "title", "width"
        ],
        FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
        FORBID_ATTR: ["style", "srcset"]
      });
    }

    const allowedTags = new Set([
      "A", "ABBR", "B", "BLOCKQUOTE", "BR", "CODE", "EM", "FIGCAPTION",
      "FIGURE", "H1", "H2", "H3", "H4", "HR", "I", "IMG", "LI", "OL",
      "P", "PRE", "S", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "TABLE",
      "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "UL"
    ]);
    const blockedTags = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED"]);
    const allowedAttrs = new Map([
      ["A", new Set(["href", "title"])],
      ["IMG", new Set(["src", "alt", "title", "width", "height"])]
    ]);

    template.content.querySelectorAll("*").forEach((element) => {
      if (blockedTags.has(element.tagName)) {
        element.remove();
        return;
      }

      if (!allowedTags.has(element.tagName)) {
        element.replaceWith(...element.childNodes);
        return;
      }

      [...element.attributes].forEach((attribute) => {
        const allowed = allowedAttrs.get(element.tagName);
        if (!allowed || !allowed.has(attribute.name.toLowerCase())) {
          element.removeAttribute(attribute.name);
        }
      });

      if (element.tagName === "A") {
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noreferrer noopener");
      }

      if (element.tagName === "IMG") {
        element.setAttribute("loading", "lazy");
        element.setAttribute("decoding", "async");
        element.setAttribute("referrerpolicy", "no-referrer");
      }
    });

    return template.innerHTML;
  }

  function normalizeFeedHtml(template) {
    template.content.querySelectorAll("a").forEach((element) => {
      element.setAttribute("href", absoluteUrlFor(element.getAttribute("href") || "", element));
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noreferrer noopener");
    });

    template.content.querySelectorAll("img").forEach((element) => {
      element.setAttribute("src", absoluteUrlFor(imageSourceFromElement(element), element));
      element.setAttribute("loading", "lazy");
      element.setAttribute("decoding", "async");
      element.setAttribute("referrerpolicy", "no-referrer");
    });
  }

  function imageSourceFromElement(element) {
    return element.getAttribute("data-src") ||
      element.getAttribute("data-original") ||
      element.getAttribute("data-lazy-src") ||
      element.getAttribute("data-backup") ||
      element.getAttribute("src") ||
      "";
  }

  function dateValue(node) {
    const value = text(node, ["pubDate", "published", "updated", "dc:date", "date", "modified", "issued", "created"]);
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  }

  function formatDate(date) {
    if (!date) return "";
    const relative = relativeDateLabel(date);
    if (relative) return relative;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric"
    }).format(date);
  }

  function relativeDateLabel(date) {
    const today = startOfLocalDay(new Date());
    const target = startOfLocalDay(date);
    const daysAgo = Math.round((today - target) / 86400000);
    if (daysAgo < 0 || daysAgo > 7) return "";
    if (daysAgo === 0) return "Today";
    if (daysAgo === 1) return "Yesterday";
    return `${daysAgo} days ago`;
  }

  function startOfLocalDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function feedLink(root, channel) {
    const atomAlternate = descendants(root, "link").find((link) => {
      const rel = (link.getAttribute("rel") || "alternate").toLowerCase();
      return rel === "alternate" && link.getAttribute("href");
    });
    if (atomAlternate) return absoluteUrlFor(atomAlternate.getAttribute("href"), atomAlternate);

    const rssLink = child(channel, "link");
    return rssLink ? absoluteUrlFor(rssLink.textContent || "", rssLink) : "";
  }

  function itemLink(item) {
    const atomLink = children(item, "link").find((link) => {
      const rel = (link.getAttribute("rel") || "alternate").toLowerCase();
      return rel === "alternate" && link.getAttribute("href");
    });
    if (atomLink) return absoluteUrlFor(atomLink.getAttribute("href"), atomLink);

    const anyAtomLink = children(item, "link").find((link) => link.getAttribute("href"));
    if (anyAtomLink) return absoluteUrlFor(anyAtomLink.getAttribute("href"), anyAtomLink);

    const enclosure = attr(item, ["enclosure"], "url");
    const guid = child(item, "guid");
    const link = text(item, "link") || (guid?.getAttribute("isPermaLink") !== "false" ? normalize(guid?.textContent || "") : "");
    return absoluteUrlFor(link || enclosure, item);
  }

  function imageFrom(item, content) {
    const media = mediaImageFromElements(item) ||
      attr(item, ["itunes:image", "image", "thumbnail"], "href") ||
      text(item, ["itunes:image", "image", "thumbnail"]);
    if (media) return absoluteUrlFor(media, item);

    const match = content.match(/<img[^>]+(?:data-src|data-original|data-lazy-src|data-backup|src)=["']([^"']+)["']/i);
    return match ? absoluteUrlFor(match[1], item) : "";
  }

  function mediaImageFromElements(item) {
    const mediaElement = children(item, ["content", "thumbnail"]).find((element) => {
      const medium = (element.getAttribute("medium") || "").toLowerCase();
      const type = (element.getAttribute("type") || "").toLowerCase();
      return element.getAttribute("url") && (medium === "image" || type.startsWith("image/") || localName(element) === "thumbnail");
    });
    if (mediaElement) return mediaElement.getAttribute("url");

    const enclosure = children(item, "enclosure").find((element) => {
      const type = (element.getAttribute("type") || "").toLowerCase();
      return element.getAttribute("url") && type.startsWith("image/");
    });
    return enclosure?.getAttribute("url") || "";
  }

  function itemContent(item) {
    const richElement = childByPriority(item, ["encoded", "content", "description", "summary"], isReadableContentElement);
    return contentFromElement(richElement);
  }

  function isReadableContentElement(element, requestedName) {
    if (requestedName === "encoded") return true;
    if (requestedName === "description" || requestedName === "summary") return true;
    if (requestedName !== "content") return true;

    const hasMediaShape = element.hasAttribute("url") ||
      (element.getAttribute("medium") || "").toLowerCase() === "image" ||
      (element.getAttribute("type") || "").toLowerCase().startsWith("image/");
    return !hasMediaShape;
  }

  function contentFromElement(element) {
    if (!element) return "";

    const type = (element.getAttribute("type") || "").toLowerCase();
    const src = element.getAttribute("src");
    if (src) {
      const href = absoluteUrlFor(src, element);
      return `<p><a href="${escapeAttr(href)}">Open external content</a></p>`;
    }

    if (type === "xhtml") {
      const container = child(element, "div") || element;
      return serializeChildren(container);
    }

    const raw = element.textContent || "";
    if (type === "text" || type === "text/plain") return escapeHtml(normalize(raw));
    return decodeEntities(raw.trim());
  }

  function serializeChildren(element) {
    const serializer = new XMLSerializer();
    return [...element.childNodes].map((node) => serializer.serializeToString(node)).join("");
  }

  function feedKind(root) {
    const name = localName(root);
    if (name === "opml") return "opml";
    if (name === "feed") return "atom";
    if (name === "rss") return "rss";
    if (name === "rdf" || name === "rdf:rdf") return "rdf";
    if (child(root, "channel") && descendants(root, "item").length) return "rss";
    return "";
  }

  function looksLikeOpml(xmlDoc) {
    return localName(xmlDoc.documentElement) === "opml";
  }

  function parseOpml(xmlDoc, opmlUrl = location.href) {
    state.sourceUrl = opmlUrl;
    const root = xmlDoc.documentElement;
    const head = child(root, "head");
    const body = child(root, "body") || root;
    const title = text(head, "title") || fileNameFromUrl(opmlUrl) || "OPML Subscriptions";
    const sections = opmlSections(body);
    const outlines = sections.flatMap((section) => section.outlines);

    return {
      title,
      feedUrl: opmlUrl,
      rawUrl: rawFeedUrl(opmlUrl),
      sections,
      outlines
    };
  }

  function opmlSections(body) {
    const directOutlines = children(body, "outline");
    const sections = directOutlines.flatMap((outline) => {
      const xmlUrl = outlineXmlUrl(outline);
      if (xmlUrl) return [];

      const title = outlineLabel(outline) || "Subscriptions";
      const outlines = flattenOutlines(outline, title);
      return outlines.length ? [{ title, outlines }] : [];
    });

    const ungrouped = directOutlines
      .filter((outline) => outlineXmlUrl(outline))
      .map((outline) => opmlOutlineFromElement(outline, ""));

    if (ungrouped.length) {
      sections.unshift({ title: "Subscriptions", outlines: ungrouped });
    }

    return sections.length ? sections : [{ title: "Subscriptions", outlines: flattenOutlines(body, "") }];
  }

  function flattenOutlines(parent, group = "") {
    return children(parent, "outline").flatMap((outline) => {
      const current = outlineXmlUrl(outline) ? [opmlOutlineFromElement(outline, group)] : [];
      const nestedGroup = current.length ? group : (outlineLabel(outline) || group);
      return current.concat(flattenOutlines(outline, nestedGroup));
    });
  }

  function opmlOutlineFromElement(outline, group) {
    const label = outlineLabel(outline);
    const xmlUrl = outlineXmlUrl(outline);
    const htmlUrl = outline.getAttribute("htmlUrl") || outline.getAttribute("htmlurl") || "";
    const category = outline.getAttribute("category") || group;

    return {
      id: xmlUrl,
      title: label || xmlUrl,
      text: outline.getAttribute("text") || label || xmlUrl,
      type: outline.getAttribute("type") || "",
      category,
      xmlUrl: absoluteUrlFor(xmlUrl, outline),
      htmlUrl: htmlUrl ? absoluteUrlFor(htmlUrl, outline) : "",
      description: outline.getAttribute("description") || ""
    };
  }

  function outlineLabel(outline) {
    return outline.getAttribute("title") || outline.getAttribute("text") || "";
  }

  function outlineXmlUrl(outline) {
    return outline.getAttribute("xmlUrl") || outline.getAttribute("xmlurl") || outline.getAttribute("url") || "";
  }

  function fileNameFromUrl(value) {
    try {
      const url = new URL(value);
      return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
    } catch {
      return "";
    }
  }

  function parseFeed(xmlDoc, feedUrl = location.href) {
    state.sourceUrl = feedUrl;
    const root = xmlDoc.documentElement;
    const kind = feedKind(root);
    const isAtom = kind === "atom";
    const channel = isAtom ? root : child(root, "channel") || root;
    const itemNodes = isAtom ? children(root, "entry") : rssItems(root, channel, kind);

    const entries = itemNodes.map((item, index) => {
      const content = itemContent(item);
      const cleanSummary = (stripHtml(content) || text(item, ["description", "summary", "subtitle"])).slice(0, 220);
      const date = dateValue(item);
      const id = text(item, ["guid", "id"]) ||
        item.getAttribute("about") ||
        item.getAttribute("rdf:about") ||
        item.getAttributeNS("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "about") ||
        `entry-${index}`;

      return {
        id,
        title: text(item, ["title"]) || "Untitled",
        author: authorFrom(item),
        date,
        dateLabel: formatDate(date),
        link: itemLink(item),
        summary: cleanSummary,
        rawContent: content,
        content: ""
      };
    }).sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

    return {
      title: text(channel, ["title"]) || document.title || "RSS Feed",
      description: text(channel, ["subtitle", "description", "tagline", "rights"]),
      siteUrl: feedLink(root, channel),
      feedUrl,
      rawUrl: rawFeedUrl(feedUrl),
      updated: formatDate(dateValue(channel)),
      entries
    };
  }

  function rawFeedUrl(feedUrl = location.href) {
    return readerBypassUrl(feedUrl);
  }

  function readerBypassUrl(urlValue, fallback = location.href) {
    try {
      const url = new URL(urlValue);
      if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "file:") {
        url.hash = readerBypassHash(url.hash);
      }
      return url.href;
    } catch {
      return fallback;
    }
  }

  function readerBypassHash(hash) {
    const fragment = hash.replace(/^#/, "");
    if (!fragment) return "feedlens=0";
    if (hasReaderBypassHash(hash)) return fragment;
    return `${fragment}&feedlens=0`;
  }

  function isHttpUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  function rssItems(root, channel, kind) {
    const directChannelItems = children(channel, "item");
    if (directChannelItems.length) return directChannelItems;

    if (kind === "rdf") {
      const rootItems = children(root, "item");
      if (rootItems.length) return rootItems;
    }

    return descendants(root, "item");
  }

  function authorFrom(item) {
    const atomAuthor = child(item, "author");
    const atomName = atomAuthor ? text(atomAuthor, "name") : "";
    return atomName || text(item, ["dc:creator", "creator", "author", "managingEditor", "webMaster"]);
  }

  function looksLikeFeed(xmlDoc) {
    const root = xmlDoc.documentElement;
    if (!root) return false;
    if (looksLikeOpml(xmlDoc)) return true;
    if (feedKind(root)) return true;
    const name = localName(root);
    if (RSS_NAMES.has(name)) return true;
    return Boolean(child(root, "channel") || children(root, "entry").length || descendants(root, "item").length);
  }

  function getXmlDocument() {
    const contentType = document.contentType || "";
    if (XML_CONTENT_TYPES.some((type) => contentType.includes(type)) && looksLikeFeed(document)) {
      return document;
    }

    const bodyText = document.body?.innerText?.trim() || "";
    const xmlText = extractXmlText(bodyText);
    if (!xmlText) return null;

    const parsed = new DOMParser().parseFromString(xmlText, "application/xml");
    if (parsed.querySelector("parsererror")) return null;
    return parsed;
  }

  function xmlDocumentFromText(xmlText) {
    const parsed = new DOMParser().parseFromString(xmlText, "application/xml");
    if (parsed.querySelector("parsererror")) return null;
    return parsed;
  }

  function extractXmlText(value) {
    if (!value) return "";
    const trimmed = value.trim();
    if (trimmed.startsWith("<")) return trimmed;

    const start = [
      trimmed.indexOf("<?xml"),
      trimmed.indexOf("<rss"),
      trimmed.indexOf("<feed"),
      trimmed.indexOf("<rdf:RDF"),
      trimmed.indexOf("<opml")
    ].filter((index) => index >= 0).sort((a, b) => a - b)[0];

    return typeof start === "number" ? trimmed.slice(start) : "";
  }

  function icon(name) {
    const paths = {
      open: "M10 3V5H5V19H19V14H21V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3H10ZM17.5858 5H13V3H21V11H19V6.41421L12 13.4142L10.5858 12L17.5858 5Z",
      copy: "M6.9998 6V3C6.9998 2.44772 7.44752 2 7.9998 2H19.9998C20.5521 2 20.9998 2.44772 20.9998 3V17C20.9998 17.5523 20.5521 18 19.9998 18H16.9998V20.9991C16.9998 21.5519 16.5499 22 15.993 22H4.00666C3.45059 22 3 21.5554 3 20.9991L3.0026 7.00087C3.0027 6.44811 3.45264 6 4.00942 6H6.9998ZM5.00242 8L5.00019 20H14.9998V8H5.00242ZM8.9998 6H16.9998V16H18.9998V4H8.9998V6Z",
      add: "M11 11V5H13V11H19V13H13V19H11V13H5V11H11Z",
      rssLine: "M3 17C5.20914 17 7 18.7909 7 21H3V17ZM3 10C9.07513 10 14 14.9249 14 21H12C12 16.0294 7.97056 12 3 12V10ZM3 3C12.9411 3 21 11.0589 21 21H19C19 12.1634 11.8366 5 3 5V3Z",
      globalLine: "M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM9.71002 19.6674C8.74743 17.6259 8.15732 15.3742 8.02731 13H4.06189C4.458 16.1765 6.71639 18.7747 9.71002 19.6674ZM10.0307 13C10.1811 15.4388 10.8778 17.7297 12 19.752C13.1222 17.7297 13.8189 15.4388 13.9693 13H10.0307ZM19.9381 13H15.9727C15.8427 15.3742 15.2526 17.6259 14.29 19.6674C17.2836 18.7747 19.542 16.1765 19.9381 13ZM4.06189 11H8.02731C8.15732 8.62577 8.74743 6.37407 9.71002 4.33256C6.71639 5.22533 4.458 7.8235 4.06189 11ZM10.0307 11H13.9693C13.8189 8.56122 13.1222 6.27025 12 4.24799C10.8778 6.27025 10.1811 8.56122 10.0307 11ZM14.29 4.33256C15.2526 6.37407 15.8427 8.62577 15.9727 11H19.9381C19.542 7.8235 17.2836 5.22533 14.29 4.33256Z",
      calendarLine: "M9 1V3H15V1H17V3H21C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3H7V1H9ZM20 11H4V19H20V11ZM7 5H4V9H20V5H17V7H15V5H9V7H7V5Z"
    };
    return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="${paths[name]}" /></svg>`;
  }

  function feedInfoIcon(name, label) {
    return `${icon(name)}<span class="br-sr-only">${escapeHtml(label)}</span>`;
  }

  function brandIcon(className = "br-brand-icon") {
    return `<img class="${className}" src="${escapeAttr(chrome.runtime.getURL("icons/icon-48.png"))}" alt="" aria-hidden="true">`;
  }

  function render() {
    const { feed, selectedIndex } = state;
    rememberListScroll();
    const selected = feed.entries[selectedIndex];
    const appHtml = `
      <main class="br-app">
        <aside class="br-sidebar">
          <header class="br-feed-header">
            <div class="br-mark">${brandIcon()}</div>
            <div>
              <h1>${escapeHtml(feed.title)}</h1>
              ${feed.description ? `<p>${escapeHtml(feed.description)}</p>` : ""}
            </div>
          </header>
          <div class="br-feed-info">
            <dl>
              <div>
                <dt title="RSS">${feedInfoIcon("rssLine", "RSS")}</dt>
                <dd title="${escapeAttr(feed.feedUrl)}">${escapeHtml(feed.feedUrl)}</dd>
              </div>
              ${feed.siteUrl ? `
                <div>
                  <dt title="Site">${feedInfoIcon("globalLine", "Site")}</dt>
                  <dd><a href="${escapeAttr(feed.siteUrl)}" target="_blank" rel="noreferrer noopener">${escapeHtml(feed.siteUrl)}</a></dd>
                </div>
              ` : ""}
              ${feed.updated ? `
                <div>
                  <dt title="Updated">${feedInfoIcon("calendarLine", "Updated")}</dt>
                  <dd>${escapeHtml(feed.updated)}</dd>
                </div>
              ` : ""}
            </dl>
          </div>
          <div class="br-feed-actions">
            <div class="br-primary-actions">
              <button class="br-copy-feed br-icon-button" type="button" title="Copy RSS URL" aria-label="Copy RSS URL">${icon("copy")}</button>
              <div class="br-subscribe-menu">
                <button class="br-subscribe-toggle" type="button" aria-haspopup="menu" aria-expanded="false">${icon("add")} <span>Subscribe</span></button>
                <div class="br-subscribe-list" role="menu">
                  ${subscribeMenuItems(feed.feedUrl)}
                </div>
              </div>
            </div>
            <a class="br-raw-link" href="${escapeAttr(feed.rawUrl)}" target="_blank" rel="noreferrer noopener" title="View original XML">Raw XML</a>
            <span>${feed.entries.length} items</span>
          </div>
          <nav class="br-list" aria-label="Feed entries">
            ${feed.entries.map((entry, index) => entryButton(entry, index, index === selectedIndex)).join("")}
          </nav>
        </aside>
        <article class="br-reader">
          ${selected ? articleHtml(selected) : emptyHtml()}
        </article>
      </main>
    `;

    if (replaceXmlDocumentWithHtml(feed, appHtml)) {
      bindReaderEvents();
      restoreListScroll();
      return;
    }

    ensureHtmlDocument(feed);
    document.title = `${feed.title} - FeedLens`;
    replaceBodyChildren(appHtml);
    bindReaderEvents();
    restoreListScroll();
  }

  function renderOpml() {
    const { opml } = state;
    const appHtml = `
      <main class="br-opml-app">
        <header class="br-opml-header">
          <div class="br-mark">${brandIcon()}</div>
          <div>
            <h1>${escapeHtml(opml.title)}</h1>
            <p>${opml.outlines.length} subscriptions</p>
          </div>
          <div class="br-opml-actions">
            <button class="br-copy-feed" type="button" title="Copy OPML URL">${icon("copy")} <span>Copy OPML</span></button>
            <a class="br-raw-link" href="${escapeAttr(opml.rawUrl)}" target="_blank" rel="noreferrer noopener" title="View original OPML">Raw OPML</a>
          </div>
        </header>
        ${opml.sections.map(opmlSection).join("")}
      </main>
    `;

    ensureHtmlDocument({ title: opml.title });
    document.title = `${opml.title} - FeedLens`;
    replaceBodyChildren(appHtml);
    document.querySelector(".br-copy-feed")?.addEventListener("click", copyOpmlUrl);
    document.querySelectorAll(".br-opml-card").forEach((card) => {
      card.addEventListener("click", () => {
        markOpmlVisited(card.dataset.url);
        card.classList.add("is-visited");
      });
    });
    document.querySelectorAll(".br-opml-open").forEach((button) => {
      const openSite = (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.open(button.dataset.href, "_blank", "noopener,noreferrer");
      };
      button.addEventListener("click", openSite);
      button.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        openSite(event);
      });
    });
    document.querySelectorAll(".br-opml-copy").forEach((button) => {
      button.addEventListener("click", copyOpmlCardUrl);
      button.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        copyOpmlCardUrl(event);
      });
    });
  }

  function subscribeMenuItems(feedUrl) {
    const disabled = !isHttpUrl(feedUrl);
    const readerItems = SUBSCRIBE_READERS.map((reader) => `
      <button class="br-subscribe-item" type="button" role="menuitem" data-reader="${escapeAttr(reader.id)}" ${disabled ? "disabled" : ""}>
        ${escapeHtml(reader.label)}
      </button>
    `).join("");

    return `
      ${readerItems}
      <button class="br-subscribe-item" type="button" role="menuitem" data-reader="custom" ${disabled ? "disabled" : ""}>Custom reader</button>
    `;
  }

  function opmlSection(section) {
    return `
      <section class="br-opml-section">
        <header>
          <h2>${escapeHtml(section.title)}</h2>
          <span>${section.outlines.length}</span>
        </header>
        <div class="br-opml-grid">
          ${section.outlines.map(opmlCard).join("")}
        </div>
      </section>
    `;
  }

  function opmlCard(outline) {
    const visited = isOpmlVisited(outline.xmlUrl);
    return `
      <a class="br-opml-card ${visited ? "is-visited" : ""}" href="${escapeAttr(outline.xmlUrl)}" target="_blank" rel="noreferrer noopener" data-url="${escapeAttr(outline.xmlUrl)}">
        <span class="br-opml-card-body">
          <strong>${escapeHtml(outline.title)}</strong>
          <em>${escapeHtml(outline.xmlUrl)}</em>
          ${outline.description ? `<p>${escapeHtml(outline.description)}</p>` : ""}
        </span>
        <span class="br-opml-tools">
          <span class="br-opml-copy" role="button" tabindex="0" data-url="${escapeAttr(outline.xmlUrl)}" title="Copy RSS URL" aria-label="Copy RSS URL">${icon("copy")}</span>
          ${outline.htmlUrl ? `<span class="br-opml-open" role="button" tabindex="0" data-href="${escapeAttr(outline.htmlUrl)}" title="Open site" aria-label="Open site">${icon("open")}</span>` : ""}
        </span>
      </a>
    `;
  }

  async function copyOpmlCardUrl(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    try {
      await copyText(button.dataset.url);
      button.classList.add("is-copied");
      button.setAttribute("title", "Copied");
      window.setTimeout(() => {
        button.classList.remove("is-copied");
        button.setAttribute("title", "Copy RSS URL");
      }, 1200);
    } catch {
      button.setAttribute("title", "Copy failed");
      window.setTimeout(() => button.setAttribute("title", "Copy RSS URL"), 1200);
    }
  }

  async function copyOpmlUrl(event) {
    const button = event.currentTarget;
    const label = button.querySelector("span");
    const original = label.textContent;
    try {
      await copyText(state.opml.feedUrl);
      label.textContent = "Copied";
      button.classList.add("is-copied");
    } catch {
      label.textContent = "Copy failed";
    }
    window.setTimeout(() => {
      label.textContent = original;
      button.classList.remove("is-copied");
    }, 1400);
  }

  function opmlVisitedKey(url) {
    return `feedlens:opml:visited:${url}`;
  }

  function isOpmlVisited(url) {
    try {
      return localStorage.getItem(opmlVisitedKey(url)) === "1";
    } catch {
      return false;
    }
  }

  function markOpmlVisited(url) {
    try {
      localStorage.setItem(opmlVisitedKey(url), "1");
    } catch {
      // Visited state is a convenience; ignore storage failures.
    }
  }

  function replaceBodyChildren(markup) {
    const htmlDoc = new DOMParser().parseFromString(markup, "text/html");
    document.body.replaceChildren(...[...htmlDoc.body.childNodes].map((node) => document.importNode(node, true)));
  }

  function bindReaderEvents() {
    document.querySelectorAll(".br-entry").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedIndex = Number(button.dataset.index);
        renderAndResetReader();
      });
    });

    document.querySelector(".br-copy-feed")?.addEventListener("click", copyFeedUrl);
    document.querySelector(".br-subscribe-toggle")?.addEventListener("click", toggleSubscribeMenu);
    document.querySelectorAll(".br-subscribe-item").forEach((button) => {
      button.addEventListener("click", openSubscribeTarget);
    });
    if (!state.documentClickBound) {
      document.addEventListener("click", closeSubscribeMenuOnOutsideClick);
      state.documentClickBound = true;
    }
    if (!state.keydownBound) {
      document.addEventListener("keydown", onReaderKeydown);
      state.keydownBound = true;
    }
  }

  function replaceXmlDocumentWithHtml(feed, appHtml) {
    const isHtmlDocument = document.documentElement?.tagName?.toLowerCase() === "html" && document.contentType === "text/html";
    if (isHtmlDocument) return false;

    document.open("text/html", "replace");
    document.write(fullHtmlDocument(feed, appHtml));
    document.close();
    return true;
  }

  function fullHtmlDocument(feed, appHtml) {
    return `<!doctype html>
<html class="feedlens-active">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(`${feed.title} - FeedLens`)}</title>
    <style id="feedlens-style">${state.readerCss || ""}</style>
  </head>
  <body>${appHtml}</body>
</html>`;
  }

  function renderAndResetReader() {
    render();
    window.scrollTo({ top: 0 });
    if (window.matchMedia("(max-width: 780px)").matches) {
      document.querySelector(".br-reader")?.scrollIntoView({ block: "start" });
    }
  }

  function rememberListScroll() {
    const list = document.querySelector(".br-list");
    if (!list) return;
    state.listScrollTop = list.scrollTop;
    state.listScrollLeft = list.scrollLeft;
  }

  function restoreListScroll() {
    const list = document.querySelector(".br-list");
    if (!list) return;
    list.scrollTop = state.listScrollTop;
    list.scrollLeft = state.listScrollLeft;
  }

  function onReaderKeydown(event) {
    if (!state.feed || event.altKey || event.ctrlKey || event.metaKey) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)) return;

    const inEntryList = Boolean(event.target?.closest?.(".br-sidebar, .br-list, .br-entry"));

    if (event.key === "j" || (event.key === "ArrowDown" && inEntryList)) {
      event.preventDefault();
      selectEntry(Math.min(state.selectedIndex + 1, state.feed.entries.length - 1));
    }

    if (event.key === "k" || (event.key === "ArrowUp" && inEntryList)) {
      event.preventDefault();
      selectEntry(Math.max(state.selectedIndex - 1, 0));
    }
  }

  function selectEntry(index) {
    if (index === state.selectedIndex) return;
    state.selectedIndex = index;
    renderAndResetReader();
    document.querySelector(`.br-entry[data-index="${index}"]`)?.focus({ preventScroll: true });
  }

  async function copyFeedUrl(event) {
    const button = event.currentTarget;
    const originalLabel = button.getAttribute("aria-label") || "Copy RSS URL";
    const originalTitle = button.getAttribute("title") || originalLabel;

    try {
      await copyText(state.feed.feedUrl);
      button.setAttribute("aria-label", "Copied");
      button.setAttribute("title", "Copied");
      button.classList.add("is-copied");
      window.setTimeout(() => {
        button.setAttribute("aria-label", originalLabel);
        button.setAttribute("title", originalTitle);
        button.classList.remove("is-copied");
      }, 1400);
    } catch {
      button.setAttribute("aria-label", "Copy failed");
      button.setAttribute("title", "Copy failed");
      window.setTimeout(() => {
        button.setAttribute("aria-label", originalLabel);
        button.setAttribute("title", originalTitle);
      }, 1400);
    }
  }

  function toggleSubscribeMenu(event) {
    event.stopPropagation();
    const menu = event.currentTarget.closest(".br-subscribe-menu");
    const isOpen = menu?.classList.toggle("is-open");
    event.currentTarget.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  function closeSubscribeMenuOnOutsideClick(event) {
    if (event.target?.closest?.(".br-subscribe-menu")) return;
    closeSubscribeMenu();
  }

  function closeSubscribeMenu() {
    document.querySelectorAll(".br-subscribe-menu.is-open").forEach((menu) => {
      menu.classList.remove("is-open");
      menu.querySelector(".br-subscribe-toggle")?.setAttribute("aria-expanded", "false");
    });
  }

  function openSubscribeTarget(event) {
    const button = event.currentTarget;
    const readerId = button.dataset.reader;
    const targetUrl = readerId === "custom" ? customSubscribeUrl(state.feed.feedUrl) : readerSubscribeUrl(readerId, state.feed.feedUrl);
    closeSubscribeMenu();
    if (!targetUrl) return;
    window.open(readerBypassUrl(targetUrl, targetUrl), "_blank", "noopener,noreferrer");
  }

  function readerSubscribeUrl(readerId, feedUrl) {
    return SUBSCRIBE_READERS.find((reader) => reader.id === readerId)?.url(feedUrl) || "";
  }

  function customSubscribeUrl(feedUrl) {
    const current = loadCustomSubscribeTemplate();
    const template = window.prompt("Custom reader URL template. Use %s for the RSS URL.\nTT-RSS example: https://rss.example.com/public.php?op=bookmarklets--subscribe&feed_url=%s", current);
    if (!template) return "";
    saveCustomSubscribeTemplate(template);
    return template.includes("%s")
      ? template.replaceAll("%s", encodeURIComponent(feedUrl))
      : `${template}${encodeURIComponent(feedUrl)}`;
  }

  function loadCustomSubscribeTemplate() {
    try {
      return localStorage.getItem("feedlens:subscribe:custom") || "";
    } catch {
      return "";
    }
  }

  function saveCustomSubscribeTemplate(template) {
    try {
      localStorage.setItem("feedlens:subscribe:custom", template);
    } catch {
      // Custom subscribe templates are optional; ignore storage failures.
    }
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    fallbackCopy(value);
  }

  function fallbackCopy(value) {
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }

  function ensureHtmlDocument(feed) {
    const hasHtmlBody = document.body && document.documentElement?.tagName?.toLowerCase() === "html";
    if (hasHtmlBody) {
      document.documentElement.classList.add("feedlens-active");
      injectReaderStyles();
      return;
    }

    throw new Error(`FeedLens could not create an HTML reader document for ${feed.title}`);
  }

  function injectReaderStyles() {
    if (!state.readerCss || document.getElementById("feedlens-style")) return;

    const style = document.createElement("style");
    style.id = "feedlens-style";
    style.textContent = state.readerCss;
    document.head.append(style);
  }

  function entryButton(entry, index, active) {
    return `
      <button class="br-entry ${active ? "is-active" : ""}" data-index="${index}" type="button" ${active ? 'aria-current="true"' : ""}>
        <span class="br-entry-mark">${brandIcon("br-entry-brand-icon")}</span>
        <span>
          <strong>${escapeHtml(entry.title)}</strong>
          ${entry.dateLabel ? `<small>${escapeHtml(entry.dateLabel)}</small>` : ""}
          ${entry.summary ? `<em>${escapeHtml(entry.summary)}</em>` : ""}
        </span>
      </button>
    `;
  }

  function articleHtml(entry) {
    return `
      <header class="br-article-header">
        <div class="br-article-heading">
          <div class="br-meta-row">
            <div class="br-meta">${escapeHtml([entry.author, entry.dateLabel].filter(Boolean).join(" · "))}</div>
            ${entry.link ? `<a class="br-read-original" href="${escapeAttr(entry.link)}" target="_blank" rel="noreferrer noopener" title="Open original" aria-label="Open original">${icon("open")}</a>` : ""}
          </div>
          <h2>${escapeHtml(entry.title)}</h2>
        </div>
      </header>
      <section class="br-content">${entryContent(entry)}</section>
    `;
  }

  function entryContent(entry) {
    if (entry.content) return entry.content;
    entry.content = entry.rawContent ? safeHtml(entry.rawContent) : `<p>${escapeHtml(entry.summary || "")}</p>`;
    return entry.content;
  }

  function emptyHtml() {
    return `
      <div class="br-empty">
        <div class="br-mark">${brandIcon()}</div>
        <h2>No entries found</h2>
        <p>This XML looks like a feed, but it does not contain readable items.</p>
      </div>
    `;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }

  async function init() {
    if (shouldBypassReader()) return;
    if (state.feed || state.opml) return;

    const readerFeedUrl = readerPageFeedUrl();
    if (readerFeedUrl) {
      state.readerCss = needsInlineReaderCss() ? await loadReaderCss() : "";
      await renderFeedUrl(readerFeedUrl);
      return;
    }

    const xmlDoc = getXmlDocument();
    if (!xmlDoc || !looksLikeFeed(xmlDoc)) {
      retryInit();
      return;
    }

    if (looksLikeOpml(xmlDoc)) {
      state.opml = parseOpml(xmlDoc, location.href);
      renderOpml();
      globalThis.__feedLensRendered = true;
      return;
    }

    const feed = parseFeed(xmlDoc, location.href);
    if (!feed.entries.length) {
      retryInit();
      return;
    }

    state.feed = feed;
    state.readerCss = needsInlineReaderCss() ? await loadReaderCss() : "";
    render();
    globalThis.__feedLensRendered = true;
  }

  async function renderXmlText(xmlText) {
    if (shouldBypassReader() || state.feed || state.opml || !xmlText) return;

    const xmlDoc = xmlDocumentFromText(xmlText);
    if (!xmlDoc || !looksLikeFeed(xmlDoc)) return;

    if (looksLikeOpml(xmlDoc)) {
      state.opml = parseOpml(xmlDoc, state.sourceUrl || location.href);
      if (!state.opml.outlines.length) return;
      renderOpml();
      globalThis.__feedLensRendered = true;
      return;
    }

    const feed = parseFeed(xmlDoc, state.sourceUrl || location.href);
    if (!feed.entries.length) return;

    state.feed = feed;
    state.readerCss = needsInlineReaderCss() ? await loadReaderCss() : "";
    render();
    globalThis.__feedLensRendered = true;
  }

  async function renderFeedUrl(feedUrl) {
    state.sourceUrl = feedUrl;
    const response = await fetch(feedUrl, { credentials: "omit" });
    if (!response.ok) {
      renderReaderError(new Error(`Feed request failed: ${response.status}`));
      return;
    }
    await renderXmlText(await response.text());
    if (!state.feed && !state.opml) {
      renderReaderError(new Error("This URL did not return a recognizable RSS, Atom, or OPML document."));
    }
  }

  function readerPageFeedUrl() {
    try {
      if (location.protocol !== "chrome-extension:" || !location.pathname.endsWith("/src/reader.html")) return "";
      return new URL(location.href).searchParams.get("feed") || "";
    } catch {
      return "";
    }
  }

  function shouldBypassReader() {
    try {
      return hasReaderBypassHash(new URL(location.href).hash);
    } catch {
      return false;
    }
  }

  function hasReaderBypassHash(hash) {
    return /(?:^|[?&])feedlens=0(?:[&#]|$)/.test(hash.replace(/^#/, ""));
  }

  function retryInit() {
    if (state.attempts >= 4) return;
    state.attempts += 1;
    window.setTimeout(init, state.attempts * 250);
  }

  async function loadReaderCss() {
    try {
      if (typeof chrome === "undefined" || !chrome.runtime?.getURL) return "";
      const response = await fetch(chrome.runtime.getURL("src/reader.css"));
      return response.ok ? response.text() : "";
    } catch {
      return "";
    }
  }

  function needsInlineReaderCss() {
    return location.protocol !== "chrome-extension:";
  }

  globalThis.__feedLensTryInit = init;
  globalThis.__feedLensRenderXmlText = (xmlText) => {
    renderXmlText(xmlText).catch((error) => {
      console.warn("FeedLens could not render fetched feed text:", error);
      renderReaderError(error);
    });
  };
  init().catch((error) => {
    console.warn("FeedLens could not render this feed:", error);
    renderReaderError(error);
  });

  function renderReaderError(error) {
    if (location.protocol !== "chrome-extension:" || state.feed || state.opml) return;
    const feedUrl = readerPageFeedUrl() || state.sourceUrl;
    const rawUrl = rawFeedUrl(feedUrl);
    const sourceUrl = sourcePageUrl(feedUrl);
    const message = normalize(error?.message || "FeedLens could not preview this feed.");
    const appHtml = `
      <main class="br-error-app">
        <section class="br-error-card" role="alert">
          <div class="br-mark">${brandIcon()}</div>
          <p class="br-error-eyebrow">Feed unavailable</p>
          <h1>FeedLens could not open this RSS feed</h1>
          <p class="br-error-message">${escapeHtml(message)}</p>
          <dl class="br-error-details">
            <div>
              <dt>Feed URL</dt>
              <dd>${escapeHtml(feedUrl)}</dd>
            </div>
          </dl>
          <div class="br-error-actions">
            <a class="br-error-primary" href="${escapeAttr(sourceUrl)}">Back to site</a>
            <a class="br-error-secondary" href="${escapeAttr(rawUrl)}" target="_blank" rel="noreferrer noopener">Open raw URL</a>
          </div>
        </section>
      </main>
    `;

    ensureHtmlDocument({ title: "Feed unavailable" });
    document.title = "Feed unavailable - FeedLens";
    replaceBodyChildren(appHtml);
  }

  function sourcePageUrl(feedUrl) {
    try {
      const url = new URL(feedUrl);
      url.hash = "";
      const path = url.pathname.replace(/(?:^|\/)(?:feed|rss|atom|index\.xml|feed\.(?:xml|html?)|rss\.(?:xml|html?)|atom\.(?:xml|html?))(?:\/)?$/i, "/");
      url.pathname = path || "/";
      url.search = "";
      return url.href;
    } catch {
      return "/";
    }
  }
})();
