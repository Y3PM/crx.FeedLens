const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isFeedContentType,
  shouldTryReader,
  shouldTryReaderByHeaders
} = require("../src/background.js");

test("isFeedContentType accepts standard RSS, Atom, RDF, and OPML content types", () => {
  const validTypes = [
    "application/rss+xml",
    "application/rss+xml; charset=utf-8",
    "application/atom+xml",
    "application/atom+xml; charset=UTF-8",
    "application/rdf+xml",
    "application/feed+xml",
    "application/xml",
    "application/xml; charset=utf-8",
    "text/xml",
    "text/xml; charset=iso-8859-1",
    "text/rss+xml",
    "text/atom+xml",
    "application/x-opml",
    "application/opml+xml",
    "text/x-opml",
    "Application/RSS+XML; Charset=utf-8"
  ];

  validTypes.forEach((type) => {
    assert.equal(isFeedContentType(type), true, `Expected ${type} to be recognized as feed content type`);
  });
});

test("isFeedContentType rejects SVG badges and non-feed content types", () => {
  const invalidTypes = [
    "image/svg+xml",
    "image/svg+xml;charset=utf-8",
    "image/png",
    "image/jpeg",
    "image/webp",
    "text/html; charset=utf-8",
    "text/plain",
    "text/css",
    "application/json",
    "application/javascript",
    "application/pdf",
    "application/xhtml+xml",
    "application/xml-dtd",
    "font/otf+xml",
    "",
    null,
    undefined
  ];

  invalidTypes.forEach((type) => {
    assert.equal(isFeedContentType(type), false, `Expected ${type} to be rejected`);
  });
});

test("shouldTryReaderByHeaders rejects shields.io badge URL", () => {
  const badgeDetails = {
    tabId: 1,
    url: "https://img.shields.io/badge/Format-4%20Days%20Intensive%20Camp-orange?style=flat-square",
    statusCode: 200,
    responseHeaders: [
      { name: "content-type", value: "image/svg+xml;charset=utf-8" }
    ]
  };

  assert.equal(shouldTryReaderByHeaders(badgeDetails), false);
});

test("shouldTryReaderByHeaders accepts actual feeds with appropriate content-type", () => {
  const feedDetails = {
    tabId: 1,
    url: "https://pyrsshub.vercel.app/feeds",
    statusCode: 200,
    responseHeaders: [
      { name: "content-type", value: "application/xml; charset=utf-8" }
    ]
  };

  assert.equal(shouldTryReaderByHeaders(feedDetails), true);
});

test("shouldTryReader rejects image and static asset resources under /rss/ or /feed/ paths", () => {
  assert.equal(shouldTryReader("https://example.com/rss/logo.png"), false);
  assert.equal(shouldTryReader("https://example.com/feed/icon.svg"), false);
  assert.equal(shouldTryReader("https://example.com/atom/bundle.js"), false);
  assert.equal(shouldTryReader("https://img.shields.io/badge/Format-4%20Days%20Intensive%20Camp-orange?style=flat-square"), false);
});

test("shouldTryReader accepts typical feed URLs", () => {
  assert.equal(shouldTryReader("https://example.com/feed"), true);
  assert.equal(shouldTryReader("https://example.com/blog/rss.xml"), true);
  assert.equal(shouldTryReader("https://example.com/atom.xml"), true);
  assert.equal(shouldTryReader("https://example.com/?feed=rss"), true);
});

test("shouldTryReader rejects sitemaps and config XMLs", () => {
  assert.equal(shouldTryReader("https://example.com/sitemap.xml"), false);
  assert.equal(shouldTryReader("https://example.com/sitemap_index.xml"), false);
  assert.equal(shouldTryReader("https://example.com/sitemap-news.xml"), false);
  assert.equal(shouldTryReader("https://example.com/pom.xml"), false);
  assert.equal(shouldTryReader("https://example.com/web.xml"), false);
  assert.equal(shouldTryReader("https://example.com/crossdomain.xml"), false);
  assert.equal(shouldTryReader("https://example.com/clientaccesspolicy.xml"), false);
});

test("shouldTryReaderByHeaders rejects sitemaps even with application/xml content-type", () => {
  const sitemapDetails = {
    tabId: 1,
    url: "https://example.com/sitemap.xml",
    statusCode: 200,
    responseHeaders: [
      { name: "content-type", value: "application/xml; charset=utf-8" }
    ]
  };
  assert.equal(shouldTryReaderByHeaders(sitemapDetails), false);

  const pomDetails = {
    tabId: 2,
    url: "https://raw.githubusercontent.com/user/repo/main/pom.xml",
    statusCode: 200,
    responseHeaders: [
      { name: "content-type", value: "text/xml; charset=utf-8" }
    ]
  };
  assert.equal(shouldTryReaderByHeaders(pomDetails), false);
});

test("shouldTryReader rejects social media activity feeds", () => {
  assert.equal(shouldTryReader("https://www.linkedin.com/feed"), false);
  assert.equal(shouldTryReader("https://www.linkedin.com/feed/"), false);
  assert.equal(shouldTryReader("https://facebook.com/feed"), false);
  assert.equal(shouldTryReader("https://www.tiktok.com/feed"), false);
  assert.equal(shouldTryReader("https://www.instagram.com/feed"), false);
});

test("shouldTryReader rejects RSSHub documentation pages", () => {
  assert.equal(shouldTryReader("https://docs.rsshub.app/guide/"), false);
  assert.equal(shouldTryReader("https://docs.rsshub.app/routes/social-media"), false);
  assert.equal(shouldTryReader("https://docs.rsshub.app/joinus/new-rss/"), false);
});

test("shouldTryReader rejects expanded non-feed resource formats", () => {
  assert.equal(shouldTryReader("https://example.com/feed/data.json"), false);
  assert.equal(shouldTryReader("https://example.com/rss/export.csv"), false);
  assert.equal(shouldTryReader("https://example.com/feed/document.txt"), false);
  assert.equal(shouldTryReader("https://example.com/rss/schema.xsd"), false);
  assert.equal(shouldTryReader("https://example.com/feed/tracks.gpx"), false);
  assert.equal(shouldTryReader("https://example.com/rss/archive.tar.gz"), false);
  assert.equal(shouldTryReader("https://example.com/feed/report.xlsx"), false);
});

test("verified real-world feeds are correctly accepted by shouldTryReaderByHeaders", () => {
  const verifiedFeeds = [
    {
      url: "https://www.v2ex.com/index.xml",
      contentType: "application/atom+xml;charset=UTF-8"
    },
    {
      url: "https://github.blog/feed/",
      contentType: "application/rss+xml; charset=UTF-8"
    },
    {
      url: "https://sspai.com/feed",
      contentType: "application/xml; charset=UTF-8"
    },
    {
      url: "https://www.theverge.com/rss/index.xml",
      contentType: "application/xml; charset=UTF-8"
    },
    {
      url: "https://feeds.bbci.co.uk/news/rss.xml",
      contentType: "text/xml; charset=utf-8"
    },
    {
      url: "https://www.ruanyifeng.com/blog/atom.xml",
      contentType: "application/xml"
    },
    {
      url: "https://pyrsshub.vercel.app/feeds",
      contentType: "application/xml; charset=utf-8"
    }
  ];

  verifiedFeeds.forEach(({ url, contentType }) => {
    assert.equal(
      shouldTryReaderByHeaders({
        tabId: 10,
        url,
        statusCode: 200,
        responseHeaders: [{ name: "content-type", value: contentType }]
      }),
      true,
      `Expected ${url} to be accepted as a feed`
    );
  });
});

test("verified real-world non-feeds are correctly rejected by shouldTryReader and shouldTryReaderByHeaders", () => {
  const verifiedNonFeeds = [
    {
      url: "https://img.shields.io/badge/Format-4%20Days%20Intensive%20Camp-orange?style=flat-square",
      contentType: "image/svg+xml;charset=utf-8"
    },
    {
      url: "https://github.blog/sitemap.xml",
      contentType: "application/xml; charset=UTF-8"
    },
    {
      url: "https://sspai.com/sitemap.xml",
      contentType: "application/xml; charset=UTF-8"
    },
    {
      url: "https://www.linkedin.com/feed",
      contentType: "text/html; charset=utf-8"
    },
    {
      url: "https://docs.rsshub.app/guide/",
      contentType: "text/html; charset=utf-8"
    }
  ];

  verifiedNonFeeds.forEach(({ url, contentType }) => {
    assert.equal(shouldTryReader(url), false, `Expected ${url} to be rejected by shouldTryReader`);
    assert.equal(
      shouldTryReaderByHeaders({
        tabId: 10,
        url,
        statusCode: 200,
        responseHeaders: [{ name: "content-type", value: contentType }]
      }),
      false,
      `Expected ${url} to be rejected by shouldTryReaderByHeaders`
    );
  });
});
