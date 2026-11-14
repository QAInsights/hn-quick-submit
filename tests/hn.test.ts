import { describe, expect, it } from "vitest";
import {
  cleanSubmitUrl,
  mediaTagFor,
  parseFnid,
  parseSubmitResult,
  parseUsername,
  prepareSubmission,
  stripSiteName,
} from "../src/shared/hn";

const SUBMIT_FORM_HTML = `
<html><body><form method="post" action="r">
<input type="hidden" name="fnid" value="aBcDeFgH1234">
<input type="hidden" name="fnop" value="submit-page">
<input type="text" name="title" value="" size="50">
</form></body></html>`;

const LOGGED_IN_HTML = `
<tr><td class="pagetop">
<a id="me" href="user?id=nkn">nkn</a> <span id="karma">1234</span>
<a href="logout?auth=abc">logout</a>
</td></tr>`;

const LOGGED_OUT_HTML = `
<tr><td class="pagetop">
<a href="login?goto=news">login</a>
</td></tr>`;

describe("parseFnid", () => {
  it("extracts the CSRF token from the submit form", () => {
    expect(parseFnid(SUBMIT_FORM_HTML)).toBe("aBcDeFgH1234");
  });
  it("returns null when the token is absent", () => {
    expect(parseFnid(LOGGED_OUT_HTML)).toBeNull();
  });
});

describe("parseUsername", () => {
  it("reads the username from the signed-in top bar", () => {
    expect(parseUsername(LOGGED_IN_HTML)).toBe("nkn");
  });
  it("returns null on a logged-out page", () => {
    expect(parseUsername(LOGGED_OUT_HTML)).toBeNull();
  });
});

describe("parseSubmitResult", () => {
  it("treats an item redirect as a duplicate-or-posted success", () => {
    const r = parseSubmitResult(
      "https://news.ycombinator.com/item?id=45918372",
      "",
    );
    expect(r).toEqual({
      ok: true,
      itemUrl: "https://news.ycombinator.com/item?id=45918372",
      duplicate: true,
    });
  });
  it("treats a redirect to /newest as a fresh post", () => {
    const r = parseSubmitResult("https://news.ycombinator.com/newest", "");
    expect(r.ok).toBe(true);
  });
  it("extracts the error text when HN stays on /r", () => {
    const r = parseSubmitResult(
      "https://news.ycombinator.com/r",
      "<body>title can't be blank</body>",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("title can't be blank");
  });
  it("treats an fnop bounce as a rejection, not a success link", () => {
    const r = parseSubmitResult(
      "https://news.ycombinator.com/x?fnid=BfpNnD6wdUBUiVhyEMnY0a&fnop=toolong-title",
      "",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("hn-error");
      expect(r.detail).toContain("80 characters");
    }
  });
  it("falls back to the page text for unknown fnop codes", () => {
    const r = parseSubmitResult(
      "https://news.ycombinator.com/x?fnid=xyz&fnop=some-new-error",
      "<body>unknown problem</body>",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("unknown problem");
  });
});

describe("cleanSubmitUrl", () => {
  it("drops tracking params but keeps real ones", () => {
    expect(
      cleanSubmitUrl(
        "https://example.com/a?id=42&utm_source=x&fbclid=abc&si=trk",
      ),
    ).toBe("https://example.com/a?id=42");
  });
  it("drops scroll-to-text fragments", () => {
    expect(cleanSubmitUrl("https://example.com/a#:~:text=hello")).toBe(
      "https://example.com/a",
    );
  });
  it("returns the input when unparseable", () => {
    expect(cleanSubmitUrl("not a url")).toBe("not a url");
  });
});

describe("stripSiteName", () => {
  const nvidia = "https://developer.nvidia.com/blog/x/";
  it("removes a host-matching site suffix", () => {
    expect(
      stripSiteName(
        "Faster Scientific Simulations with New FP64 Algorithms in NVIDIA cuBLAS | NVIDIA Technical Blog",
        nvidia,
      ),
    ).toBe(
      "Faster Scientific Simulations with New FP64 Algorithms in NVIDIA cuBLAS",
    );
  });
  it("removes generic publication suffixes", () => {
    expect(stripSiteName("Some Post - Medium", "https://medium.com/p/x")).toBe(
      "Some Post",
    );
  });
  it("keeps unrelated suffixes", () => {
    const t = "State of the art - a survey";
    expect(stripSiteName(t, "https://example.com")).toBe(t);
  });
});

describe("mediaTagFor", () => {
  it("tags PDFs", () => {
    expect(mediaTagFor("https://arxiv.org/pdf/2401.12345")).toBe("[pdf]");
    expect(mediaTagFor("https://x.com/paper.pdf")).toBe("[pdf]");
  });
  it("tags videos", () => {
    expect(mediaTagFor("https://www.youtube.com/watch?v=abc")).toBe("[video]");
    expect(mediaTagFor("https://youtu.be/abc")).toBe("[video]");
    expect(mediaTagFor("https://vimeo.com/123456")).toBe("[video]");
  });
  it("returns null for plain pages", () => {
    expect(mediaTagFor("https://example.com/post")).toBeNull();
  });
});

describe("prepareSubmission", () => {
  it("cleans a tracked URL and sitesuffixed title in one pass", () => {
    const r = prepareSubmission(
      "https://developer.nvidia.com/blog/x/?utm_campaign=y",
      "Faster Scientific Simulations with New FP64 Algorithms in NVIDIA cuBLAS | NVIDIA Technical Blog",
    );
    expect(r.url).toBe("https://developer.nvidia.com/blog/x/");
    expect(r.title.length).toBeLessThanOrEqual(80);
    expect(r.notes).toContain("removed tracking parameters");
    expect(r.notes).toContain("removed the site name");
  });
  it("appends the media tag and keeps the title within 80 chars", () => {
    const r = prepareSubmission(
      "https://arxiv.org/pdf/2401.12345",
      "A very long paper title that would exceed eighty characters if the tag were appended on",
    );
    expect(r.title.endsWith("[pdf]")).toBe(true);
    expect(r.title.length).toBeLessThanOrEqual(80);
  });
});
