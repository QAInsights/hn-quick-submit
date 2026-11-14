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
  const prepared = prepareSubmission(input.url, input.title);
  const title = prepared.title;
  const url = prepared.url;
  if (title.length > 80) {
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
    title,
    url,
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

const TRACKER_PARAMS =
  /^(utm_[a-z0-9_]+|fbclid|gclid|dclid|gbraid|wbraid|mc_cid|mc_eid|igshid|si|spm|vero_id|wickedid|mibextid|_ga|_gl|oly_anon_id|oly_enc_id)$/i;

/** Canonicalizes a URL for submission: drops tracking params and scroll anchors. */
export function cleanSubmitUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKER_PARAMS.test(key)) u.searchParams.delete(key);
    }
    if (u.hash.includes(":~:")) u.hash = "";
    return u.toString();
  } catch {
    return rawUrl;
  }
}

const GENERIC_TLDS = new Set([
  "com", "org", "net", "io", "dev", "co", "app", "edu", "gov", "ai",
  "me", "info", "site", "uk", "us", "de", "fr", "jp", "in", "au", "ca",
]);
const SITEISH_SUFFIX =
  /\b(blog|news|docs?|documentation|technical|official|journal|magazine|press|media|labs?|research|engineering|medium|substack|github)\b/i;

/**
 * HN asks that titles not include the site name (it is shown next to the
 * link). Strips a trailing "| Site" / "- Site" segment when it names the
 * host or reads like a publication label. Conservative: unrelated suffixes
 * are kept.
 */
export function stripSiteName(title: string, pageUrl: string): string {
  let labels: string[] = [];
  try {
    labels = new URL(pageUrl).hostname
      .replace(/^www\./, "")
      .split(".")
      .filter((l) => l.length >= 3 && !GENERIC_TLDS.has(l.toLowerCase()))
      .map((l) => l.toLowerCase());
  } catch {
    /* keep the title as-is */
  }
  let t = title.trim();
  for (let i = 0; i < 3; i++) {
    const m = /^(.*)\s+[|\uFF5C\u2013\u2014\u2015-]\s+(.+)$/.exec(t);
    if (!m) break;
    const last = m[2];
    const isSiteName =
      last.length <= 50 &&
      (labels.some((l) => last.toLowerCase().includes(l)) ||
        SITEISH_SUFFIX.test(last));
    if (!isSiteName) break;
    t = m[1].trim();
  }
  return t || title;
}

/** HN asks that videos and PDFs be flagged in the title. */
export function mediaTagFor(rawUrl: string): "[pdf]" | "[video]" | null {
  try {
    const u = new URL(rawUrl);
    const path = u.pathname.toLowerCase();
    const host = u.hostname.replace(/^(www|m)\./, "");
    if (
      path.endsWith(".pdf") ||
      (host === "arxiv.org" && path.startsWith("/pdf/"))
    ) {
      return "[pdf]";
    }
    if (
      (host === "youtube.com" && /^\/(watch|shorts|clip)/.test(path)) ||
      (host === "youtu.be" && path.length > 1) ||
      (host === "vimeo.com" && /^\/\d/.test(path))
    ) {
      return "[video]";
    }
    return null;
  } catch {
    return null;
  }
}

export interface PreparedSubmission {
  url: string;
  title: string;
  notes: string[];
}

/** Applies HN's submission rules: canonical URL, site-name-free title, media tags. */
export function prepareSubmission(
  rawUrl: string,
  rawTitle: string,
): PreparedSubmission {
  const notes: string[] = [];
  const url = cleanSubmitUrl(rawUrl);
  if (url !== rawUrl) notes.push("removed tracking parameters");

  let title = rawTitle.trim().replace(/\s+/g, " ");
  const stripped = stripSiteName(title, url || rawUrl);
  if (stripped && stripped !== title) {
    title = stripped;
    notes.push("removed the site name");
  }

  const tag = mediaTagFor(url);
  if (tag && !title.toLowerCase().includes(tag)) {
    const room = 80 - tag.length - 2; // " [tag]" plus the ellipsis
    title = title.length > room ? `${title.slice(0, room).trimEnd()}\u2026` : title;
    title = `${title} ${tag}`;
    notes.push(`added ${tag}`);
  }
  return { url, title, notes };
}
