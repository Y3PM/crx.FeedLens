const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extensionSettingsUrl,
  getFileSchemeAccessState,
  isLocalFileUrl
} = require("../src/file-access.js");

test("recognizes only file URLs as local files", () => {
  assert.equal(isLocalFileUrl("file:///Users/example/Feeds.opml"), true);
  assert.equal(isLocalFileUrl("https://example.com/feed.xml"), false);
  assert.equal(isLocalFileUrl("not a URL"), false);
});

test("reads denied file access from the promise API", async () => {
  const extensionApi = {
    isAllowedFileSchemeAccess: async () => false
  };

  assert.equal(await getFileSchemeAccessState(extensionApi), false);
});

test("falls back to the callback API for older Chrome versions", async () => {
  const extensionApi = {
    isAllowedFileSchemeAccess(callback) {
      if (typeof callback !== "function") {
        throw new TypeError("callback required");
      }
      callback(true);
    }
  };

  assert.equal(await getFileSchemeAccessState(extensionApi), true);
});

test("returns an unknown state when Chrome cannot report file access", async () => {
  assert.equal(await getFileSchemeAccessState({}), null);
});

test("builds the current extension details URL", () => {
  assert.equal(
    extensionSettingsUrl({ id: "feedlens-id" }),
    "chrome://extensions/?id=feedlens-id"
  );
});
