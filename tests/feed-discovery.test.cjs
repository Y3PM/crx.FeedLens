const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isDeclaredFeedAnchor,
  isCanonicalFeedLink
} = require("../src/feed-discovery.js");

test("accepts canonical RSS, Atom, RDF, and Feed alternate links", () => {
  const acceptedTypes = [
    "application/rss+xml",
    "application/atom+xml",
    "application/rdf+xml",
    "application/feed+xml",
    "text/rss+xml",
    "text/atom+xml"
  ];

  acceptedTypes.forEach((type) => {
    assert.equal(isCanonicalFeedLink({ rel: "alternate", type, href: "/feed" }), true);
  });
});

test("accepts mixed-case metadata and multiple rel tokens", () => {
  assert.equal(isCanonicalFeedLink({
    rel: "Alternate Enclosure",
    type: "Application/RSS+XML; charset=UTF-8",
    href: "https://example.com/feed"
  }), true);
});

test("rejects generic XML even when the URL looks like a feed", () => {
  assert.equal(isCanonicalFeedLink({
    rel: "alternate",
    type: "application/xml",
    href: "/feed.xml"
  }), false);
});

test("rejects URL and title guesses without a feed MIME type", () => {
  assert.equal(isCanonicalFeedLink({ rel: "alternate", type: "", href: "/rss" }), false);
  assert.equal(isCanonicalFeedLink({ rel: "", type: "application/rss+xml", href: "/rss" }), false);
  assert.equal(isCanonicalFeedLink({ rel: "alternate", type: "application/rss+xml", href: "" }), false);
});

test("accepts a visible RSS link declared by its label and Atom XML address", () => {
  assert.equal(isDeclaredFeedAnchor({
    href: "https://www.y3pm.com/blog/atom.xml",
    text: "RSS",
    className: "rss"
  }), true);
});

test("accepts an explicitly named feed link with an OPML address", () => {
  assert.equal(isDeclaredFeedAnchor({
    href: "/subscriptions.opml",
    ariaLabel: "Export subscriptions",
    id: "rss-export"
  }), true);
});

test("rejects a feed-like URL without an explicit RSS or Atom declaration", () => {
  assert.equal(isDeclaredFeedAnchor({ href: "/blog/atom.xml", text: "Download" }), false);
});

test("rejects an RSS label when its address is not a feed document", () => {
  assert.equal(isDeclaredFeedAnchor({ href: "/newsletter", text: "RSS" }), false);
});

test("rejects RSS labels pointing to non-web protocols", () => {
  assert.equal(isDeclaredFeedAnchor({ href: "javascript:atom.xml", text: "RSS" }), false);
  assert.equal(isDeclaredFeedAnchor({ href: "file:///Users/example/atom.xml", text: "RSS" }), false);
});
