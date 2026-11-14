import {
  HN_LOGIN_URL,
  getLoginStatus,
  prepareSubmission,
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
  notes: string[];
}

function draftFromContext(
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined,
): DraftSubmission {
  if (info.menuItemId === "hqs-link" && info.linkUrl) {
    const prepared = prepareSubmission(
      info.linkUrl,
      new URL(info.linkUrl).hostname,
    );
    return {
      url: prepared.url,
      title: prepared.title,
      comment: "",
      notes: prepared.notes,
    };
  }
  const prepared = prepareSubmission(
    info.pageUrl ?? tab?.url ?? "",
    tab?.title ?? "",
  );
  return {
    url: prepared.url,
    title: prepared.title,
    comment: info.selectionText ?? "",
    notes: prepared.notes,
  };
}

const CONFIRM_WIDTH = 440;
const CONFIRM_HEIGHT = 620;

async function openConfirmWindow(draft: DraftSubmission): Promise<void> {
  const params = new URLSearchParams({
    u: draft.url,
    t: draft.title,
    c: draft.comment,
    confirm: "1",
  });
  if (draft.notes.length) params.set("n", draft.notes.join(", "));
  const parent = await chrome.windows.getLastFocused();
  const left =
    parent.left != null && parent.width != null
      ? Math.round(parent.left + (parent.width - CONFIRM_WIDTH) / 2)
      : undefined;
  const top =
    parent.top != null && parent.height != null
      ? Math.round(parent.top + (parent.height - CONFIRM_HEIGHT) / 2)
      : undefined;
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL(`${POPUP_PAGE}?${params}`),
    type: "popup",
    focused: true,
    left,
    top,
  });
  if (win.id == null) return;
  // A window spawned from a maximized window can asynchronously transition to
  // "maximized" after create() resolves, overriding earlier bounds. Retry until
  // the window settles at normal state with the target size.
  for (let i = 0; i < 15; i++) {
    const current = await chrome.windows.get(win.id);
    if (current.state === "normal" && current.width === CONFIRM_WIDTH) break;
    if (current.state !== "normal") {
      await chrome.windows.update(win.id, { state: "normal" });
    }
    await chrome.windows.update(win.id, {
      width: CONFIRM_WIDTH,
      height: CONFIRM_HEIGHT,
      left,
      top,
    });
    await new Promise((r) => setTimeout(r, 100));
  }
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
      void openConfirmWindow(draft);
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
