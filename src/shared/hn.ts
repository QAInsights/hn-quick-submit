export const HN_ORIGIN = "https://news.ycombinator.com";
export const HN_SUBMIT_URL = `${HN_ORIGIN}/submit`;
export const HN_LOGIN_URL = `${HN_ORIGIN}/login`;

export interface LoginStatus {
  loggedIn: boolean;
  username?: string;
}

export interface SubmitInput {
  title: string;
  url: string;
  text: string;
}

export type SubmitResult =
  | { ok: true; itemUrl: string; duplicate: boolean }
  | { ok: false; reason: "not-logged-in" | "no-fnid" | "hn-error" | "network"; detail?: string };

/** HN's submit form carries a CSRF token in a hidden `fnid` input. */
export function parseFnid(html: string): string | null {
  return /name="fnid"\s+value="([^"]+)"/.exec(html)?.[1] ?? null;
}

/** The top bar's profile link (`id="me"`) only renders for signed-in users. */
export function parseUsername(html: string): string | null {
  return /<a id="me"[^>]*>([^<]+)<\/a>/.exec(html)?.[1]?.trim() ?? null;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** HN bounces rejected submissions to /x?fnid=…&fnop=<reason-code>. */
const FNOP_ERRORS: Record<string, string> = {
  "toolong-title": "Title is too long — HN's limit is 80 characters.",
  "blank": "HN needs a title and a URL or text.",
  "bad-url": "HN could not use that URL.",
  toofast: "You are submitting too fast — try again in a moment.",
  throttled: "HN is rate limiting new submissions — try again later.",
  banned: "This site cannot be submitted to Hacker News.",
  dead: "HN flagged this link as dead.",
};

/**
 * Interprets the response of POST /r. HN answers a real submission with a
 * redirect to the new (or previously submitted) item, or to a listing page;
 * failures come back as a short plain error page on /r itself, or bounce to
 * /x with an fnop reason code.
 */
export function parseSubmitResult(
  finalUrl: string,
  bodyHtml: string,
): SubmitResult {
  const item = /\/item\?id=(\d+)/.exec(finalUrl);
  if (item) {
    return {
      ok: true,
      itemUrl: `${HN_ORIGIN}/item?id=${item[1]}`,
      duplicate: true,
    };
  }
  const parsed = new URL(finalUrl);
  const errorOp = parsed.searchParams.get("fnop");
  if (errorOp && errorOp !== "submit-page") {
    return {
      ok: false,
      reason: "hn-error",
      detail:
        FNOP_ERRORS[errorOp] ??
        (stripTags(bodyHtml).slice(0, 240) ||
          `Hacker News rejected the submission (${errorOp}).`),
    };
  }
  const path = parsed.pathname;
  if (path !== "/r" && !path.startsWith("/submit")) {
    // Redirected to /newest, /news, etc.: the post went through but HN did not
    // hand back the item id.
    return { ok: true, itemUrl: finalUrl, duplicate: false };
  }
  const detail = stripTags(bodyHtml).slice(0, 240);
  return {
    ok: false,
    reason: "hn-error",
    detail: detail || "Hacker News rejected the submission.",
  };
}

export async function getLoginStatus(): Promise<LoginStatus> {
  const res = await fetch(`${HN_ORIGIN}/news`, { credentials: "include" });
  const html = await res.text();
  const username = parseUsername(html);
  return { loggedIn: username !== null, username: username ?? undefined };
}

export async function submitStory(input: SubmitInput): Promise<SubmitResult> {
  if (input.title.length > 80) {
    return {
      ok: false,
      reason: "hn-error",
      detail: "Title is too long — HN's limit is 80 characters.",
    };
  }

  let fnid: string | null = null;
  try {
    const formRes = await fetch(HN_SUBMIT_URL, { credentials: "include" });
    if (new URL(formRes.url).pathname === "/login") {
      return { ok: false, reason: "not-logged-in" };
    }
    const html = await formRes.text();
    fnid = parseFnid(html);
    if (!fnid && /have to be logged in|name="acct"/.test(html)) {
      return { ok: false, reason: "not-logged-in" };
    }
  } catch {
    return { ok: false, reason: "network" };
  }
  if (!fnid) {
    return { ok: false, reason: "no-fnid" };
  }

  const body = new URLSearchParams({
    fnid,
    fnop: "submit-page",
    title: input.title,
    url: input.url,
    text: input.text,
  });
  try {
    const res = await fetch(`${HN_ORIGIN}/r`, {
      method: "POST",
      credentials: "include",
      redirect: "follow",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const html = await res.text();
    if (
      new URL(res.url).pathname === "/login" ||
      /have to be logged in/.test(html)
    ) {
      return { ok: false, reason: "not-logged-in" };
    }
    return parseSubmitResult(res.url, html);
  } catch {
    return { ok: false, reason: "network" };
  }
}

/** Official bookmarklet endpoint: opens HN's own form prefilled. */
export function submitLinkFallbackUrl(url: string, title: string): string {
  return `${HN_ORIGIN}/submitlink?u=${encodeURIComponent(url)}&t=${encodeURIComponent(title)}`;
}
