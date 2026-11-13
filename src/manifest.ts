const manifest = {
  manifest_version: 3,
  name: "HN Quick Submit",
  short_name: "HN Submit",
  version: "0.1.0",
  description:
    "Post links to Hacker News in one click — from the toolbar or the right-click menu.",
  minimum_chrome_version: "120",
  incognito: "not_allowed",
  permissions: ["activeTab", "contextMenus", "notifications", "storage"],
  host_permissions: ["https://news.ycombinator.com/*"],
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  action: {
    default_title: "Submit to Hacker News",
    default_popup: "src/pages/popup/index.html",
    default_icon: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    },
  },
  options_ui: {
    page: "src/pages/settings/index.html",
    open_in_tab: true,
  },
  icons: {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png",
  },
} satisfies chrome.runtime.Manifest;

export default manifest;
