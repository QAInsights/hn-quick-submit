import "../../shared/theme.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./popup.css";

import { getSettings, initTheme } from "../../shared/settings";
import {
  HN_LOGIN_URL,
  submitLinkFallbackUrl,
  type SubmitInput,
  type SubmitResult,
} from "../../shared/hn";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const formView = $<HTMLElement>("form-view");
const busyView = $<HTMLElement>("busy-view");
const resultView = $<HTMLElement>("result-view");
const liveRegion = $<HTMLElement>("live-region");
const titleInput = $<HTMLInputElement>("f-title");
const urlInput = $<HTMLInputElement>("f-url");
const textInput = $<HTMLTextAreaElement>("f-text");
const titleHint = $<HTMLElement>("title-hint");
const resultIcon = $<HTMLElement>("result-icon");
const resultTitle = $<HTMLElement>("result-title");
const resultDetail = $<HTMLElement>("result-detail");
const resultLink = $<HTMLAnchorElement>("result-link");
const resultBack = $<HTMLButtonElement>("result-back");
const form = $<HTMLFormElement>("submit-form");

function announce(text: string): void {
  liveRegion.textContent = "";
  liveRegion.textContent = text;
}

type View = "form" | "busy" | "result";
function show(view: View): void {
  formView.hidden = view !== "form";
  busyView.hidden = view !== "busy";
  resultView.hidden = view !== "result";
}

function showResult(result: SubmitResult, input: SubmitInput): void {
  show("result");
  if (result.ok) {
    resultIcon.className = "result-icon ok";
    resultTitle.textContent = result.duplicate
      ? "Already on Hacker News"
      : "Submitted to Hacker News";
    resultDetail.textContent = result.duplicate
      ? "This link was posted before — opening the existing discussion."
      : "Your submission is live on the newest page.";
    resultLink.hidden = false;
    resultLink.href = result.itemUrl;
    resultLink.textContent = "View on Hacker News";
    announce(resultTitle.textContent);
    return;
  }
  resultIcon.className = "result-icon err";
  resultLink.hidden = false;
  resultLink.href = submitLinkFallbackUrl(input.url, input.title);
  resultLink.textContent = "Finish on Hacker News";
  if (result.reason === "not-logged-in") {
    resultTitle.textContent = "Sign in required";
    resultDetail.textContent =
      "You need to be logged in to news.ycombinator.com to submit.";
    resultLink.href = HN_LOGIN_URL;
    resultLink.textContent = "Sign in to Hacker News";
  } else if (result.reason === "network") {
    resultTitle.textContent = "Couldn't reach Hacker News";
    resultDetail.textContent = "Check your connection and try again.";
  } else if (result.reason === "no-fnid") {
    resultTitle.textContent = "Couldn't read the submit form";
    resultDetail.textContent =
      "Hacker News may have changed its markup. Finish it there instead.";
  } else {
    resultTitle.textContent = "Hacker News rejected it";
    resultDetail.textContent =
      result.detail ?? "The submission was not accepted.";
  }
  announce(`${resultTitle.textContent}. ${resultDetail.textContent}`);
}

async function post(input: SubmitInput): Promise<void> {
  show("busy");
  const result = (await chrome.runtime.sendMessage({
    type: "hqs:submit",
    payload: input,
  })) as SubmitResult | undefined;
  showResult(
    result ?? { ok: false, reason: "network", detail: "No response." },
    input,
  );
}

async function activeTabDraft(): Promise<{ title: string; url: string }> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return { title: tab?.title ?? "", url: tab?.url ?? "" };
  } catch {
    return { title: "", url: "" };
  }
}

async function main(): Promise<void> {
  void initTheme();
  const params = new URLSearchParams(location.search);
  const fromMenu = params.get("confirm") === "1";

  if (params.get("u")) urlInput.value = params.get("u") ?? "";
  if (params.get("t")) titleInput.value = params.get("t") ?? "";
  if (params.get("c")) textInput.value = params.get("c") ?? "";

  if (!fromMenu) {
    const draft = await activeTabDraft();
    if (!urlInput.value) urlInput.value = draft.url;
    if (!titleInput.value) titleInput.value = draft.title;
  }

  const { submitMode } = await getSettings();
  if (submitMode === "instant" && !fromMenu && titleInput.value) {
    await post({
      title: titleInput.value,
      url: urlInput.value,
      text: textInput.value,
    });
    return;
  }

  const TITLE_LIMIT = 80;
  const updateTitleHint = () => {
    const len = titleInput.value.length;
    const over = len > TITLE_LIMIT;
    titleHint.textContent = over
      ? `${len} / ${TITLE_LIMIT} — HN rejects titles this long.`
      : `${len} / ${TITLE_LIMIT}`;
    titleHint.style.color = over ? "var(--danger)" : "";
  };
  titleInput.addEventListener("input", updateTitleHint);
  updateTitleHint();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const input: SubmitInput = {
      title: titleInput.value.trim(),
      url: urlInput.value.trim(),
      text: textInput.value.trim(),
    };
    if (!input.title) {
      titleInput.setCustomValidity("HN requires a title.");
      titleInput.reportValidity();
      titleInput.focus();
      titleInput.setCustomValidity("");
      return;
    }
    if (input.title.length > TITLE_LIMIT) {
      titleInput.setCustomValidity(
        `HN rejects titles over ${TITLE_LIMIT} characters — yours is ${input.title.length}.`,
      );
      titleInput.reportValidity();
      titleInput.focus();
      titleInput.setCustomValidity("");
      return;
    }
    if (!input.url && !input.text) {
      textInput.setCustomValidity(
        "Add a URL, or write text for an Ask HN post.",
      );
      textInput.reportValidity();
      textInput.focus();
      textInput.setCustomValidity("");
      return;
    }
    void post(input);
  });

  titleInput.focus();
}

resultBack.addEventListener("click", () => show("form"));

void main();
