export type ThemeSetting = "system" | "light" | "dark";
export type SubmitMode = "confirm" | "instant";

export interface HqsSettings {
  theme: ThemeSetting;
  submitMode: SubmitMode;
}

export const SETTINGS_KEY = "hqs-settings";

export const DEFAULT_SETTINGS: HqsSettings = {
  theme: "system",
  submitMode: "confirm",
};

export async function getSettings(): Promise<HqsSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const raw = stored[SETTINGS_KEY] as Partial<HqsSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...raw };
}

export async function saveSettings(
  patch: Partial<HqsSettings>,
): Promise<HqsSettings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/**
 * Applies the stored theme override to <meta name="color-scheme"> and mirrors
 * it to localStorage so theme-boot.js can apply it before first paint on the
 * next load (extension CSP forbids inline scripts, so the boot file lives in
 * public/ and reads only localStorage).
 */
export function applyThemeSetting(theme: ThemeSetting): void {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="color-scheme"]',
  );
  if (meta) {
    meta.content = theme === "system" ? "light dark" : theme;
  }
  try {
    if (theme === "system") {
      localStorage.removeItem("hqs-theme");
    } else {
      localStorage.setItem("hqs-theme", theme);
    }
  } catch {
    // localStorage unavailable: theme still applied via meta above
  }
}

/** Read the current theme from storage and wire live updates. */
export async function initTheme(): Promise<void> {
  const { theme } = await getSettings();
  applyThemeSetting(theme);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[SETTINGS_KEY]) {
      const next = (changes[SETTINGS_KEY].newValue as HqsSettings | undefined)
        ?.theme;
      applyThemeSetting(next ?? "system");
    }
  });
}
