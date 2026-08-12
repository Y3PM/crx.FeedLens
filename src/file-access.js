((root, createApi) => {
  const api = createApi();
  root.FeedLensFileAccess = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(globalThis, () => {
  function isLocalFileUrl(rawUrl) {
    try {
      return new URL(String(rawUrl || "")).protocol === "file:";
    } catch {
      return false;
    }
  }

  async function getFileSchemeAccessState(extensionApi = globalThis.chrome?.extension) {
    const checker = extensionApi?.isAllowedFileSchemeAccess;
    if (typeof checker !== "function") return null;

    try {
      const result = checker.call(extensionApi);
      if (result && typeof result.then === "function") {
        return !!(await result);
      }
      if (typeof result === "boolean") return result;
    } catch {
      // Older Chrome versions require the callback signature below.
    }

    return new Promise((resolve) => {
      try {
        checker.call(extensionApi, (allowed) => resolve(!!allowed));
      } catch {
        resolve(null);
      }
    });
  }

  function extensionSettingsUrl(runtimeApi = globalThis.chrome?.runtime) {
    const extensionId = String(runtimeApi?.id || "");
    return extensionId
      ? `chrome://extensions/?id=${extensionId}`
      : "chrome://extensions/";
  }

  return {
    extensionSettingsUrl,
    getFileSchemeAccessState,
    isLocalFileUrl
  };
});
