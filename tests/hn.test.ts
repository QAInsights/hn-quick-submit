import { describe, expect, it } from "vitest";
import {
  parseFnid,
  parseSubmitResult,
  parseUsername,
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
