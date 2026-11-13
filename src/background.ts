import {
  HN_LOGIN_URL,
  getLoginStatus,
  submitLinkFallbackUrl,
  submitStory,
  type SubmitInput,
} from "./shared/hn";
import { getSettings } from "./shared/settings";

const POPUP_PAGE = "src/pages/popup/index.html";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "hqs-page",
    title: "Submit page to Hacker News",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "hqs-link",
    title: "Submit link to Hacker News",
    contexts: ["link"],
  });
  chrome.contextMenus.create({
    id: "hqs-selection",
    title: "Submit to Hacker News with quote",
    contexts: ["selection"],
  });
});

interface DraftSubmission {
  url: string;
  title: string;
  comment: string;
}

function draftFromContext(
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined,
): DraftSubmission {
  if (info.menuItemId === "hqs-link" && info.linkUrl) {
    return {
      url: info.linkUrl,
      title: new URL(info.linkUrl).hostname,
      comment: "",
    };
  }
  return {
    url: info.pageUrl ?? tab?.url ?? "",
    title: tab?.title ?? "",
    comment: info.selectionText ?? "",
  };
}

function openConfirmWindow(draft: DraftSubmission): void {
  const params = new URLSearchParams({
    u: draft.url,
    t: draft.title,
    c: draft.comment,
    confirm: "1",
  });
  chrome.windows.create({
    url: chrome.runtime.getURL(`${POPUP_PAGE}?${params}`),
    type: "popup",
    width: 440,
    height: 620,
    focused: true,
  });
}

const notificationLinks = new Map<string, string>();

async function notify(
  title: string,
  message: string,
  linkUrl?: string,
): Promise<void> {
  const id = `hqs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (linkUrl) notificationLinks.set(id, linkUrl);
  await chrome.notifications.create(id, {
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title,
    message,
  });
}

chrome.notifications.onClicked.addListener((id) => {
  const url = notificationLinks.get(id);
  if (url) chrome.tabs.create({ url });
  notificationLinks.delete(id);
  chrome.notifications.clear(id);
});

async function submitNow(input: SubmitInput): Promise<void> {
  const result = await submitStory(input);
  if (result.ok) {
    await notify(
      "Posted to Hacker News",
      result.duplicate
        ? "HN already had this link — tap to view the existing discussion."
        : "Tap to view your submission.",
      result.itemUrl,
    );
    return;
  }
  if (result.reason === "not-logged-in") {
    await notify(
      "Not signed in",
      "Sign in to Hacker News to submit — tap to open the login page.",
      HN_LOGIN_URL,
    );
    return;
  }
  await notify(
    "Couldn't submit directly",
    "Opening Hacker News with your draft prefilled instead.",
  );
  chrome.tabs.create({
    url: submitLinkFallbackUrl(input.url, input.title),
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void (async () => {
    const draft = draftFromContext(info, tab);
    const { submitMode } = await getSettings();
    if (submitMode === "instant") {
      await submitNow({
        title: draft.title,
        url: draft.url,
        text: draft.comment,
      });
    } else {
      openConfirmWindow(draft);
    }
  })();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "hqs:submit") {
    void submitStory(message.payload as SubmitInput).then(sendResponse);
    return true;
  }
  if (message?.type === "hqs:login-status") {
    void getLoginStatus().then(sendResponse);
    return true;
  }
  if (message?.type === "hqs:open-hn") {
    chrome.tabs.create({ url: message.url as string });
    sendResponse(true);
    return false;
  }
  return false;
});
