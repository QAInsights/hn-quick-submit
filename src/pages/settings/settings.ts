import "../../shared/theme.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./settings.css";

import {
  applyThemeSetting,
  getSettings,
  initTheme,
  saveSettings,
  type SubmitMode,
  type ThemeSetting,
} from "../../shared/settings";
import { HN_LOGIN_URL, type LoginStatus } from "../../shared/hn";

const accountStatus = document.getElementById(
  "account-status",
) as HTMLElement;
const versionEl = document.getElementById("version") as HTMLElement;

function renderAccount(status: LoginStatus): void {
  accountStatus.replaceChildren();
  const badge = document.createElement("span");
  badge.className = `badge ${status.loggedIn ? "on" : "off"}`;
  accountStatus.append(badge);

  const text = document.createElement("p");
  if (status.loggedIn) {
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = status.username ?? "unknown";
    text.append("Signed in as ", who);
  } else {
    text.textContent = "Not signed in to Hacker News.";
  }
  accountStatus.append(text);

  const actions = document.createElement("span");
  actions.className = "actions";
  const signIn = document.createElement("a");
  signIn.href = HN_LOGIN_URL;
  signIn.target = "_blank";
  signIn.rel = "noopener";
  signIn.textContent = status.loggedIn ? "Hacker News" : "Sign in";
  if (status.loggedIn) {
    signIn.href = "https://news.ycombinator.com";
  }
  actions.append(signIn);
  accountStatus.append(actions);
}

async function main(): Promise<void> {
  void initTheme();
  versionEl.textContent = `v${chrome.runtime.getManifest().version}`;

  const settings = await getSettings();
  for (const input of document.querySelectorAll<HTMLInputElement>(
    'input[name="submitMode"]',
  )) {
    input.checked = input.value === settings.submitMode;
    input.addEventListener("change", async () => {
      if (input.checked) {
        await saveSettings({ submitMode: input.value as SubmitMode });
      }
    });
  }
  for (const input of document.querySelectorAll<HTMLInputElement>(
    'input[name="theme"]',
  )) {
    input.checked = input.value === settings.theme;
    input.addEventListener("change", async () => {
      if (input.checked) {
        const theme = input.value as ThemeSetting;
        applyThemeSetting(theme);
        await saveSettings({ theme });
      }
    });
  }

  try {
    const status = (await chrome.runtime.sendMessage({
      type: "hqs:login-status",
    })) as LoginStatus;
    renderAccount(status);
  } catch {
    renderAccount({ loggedIn: false });
  }
}

void main();
