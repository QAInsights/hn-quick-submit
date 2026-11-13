// Runs synchronously before first paint. Extension CSP forbids inline scripts,
// so this file lives in public/ and mirrors only the theme preference that
// src/shared/settings.ts keeps in localStorage.
try {
  var t = localStorage.getItem("hqs-theme");
  var m = document.querySelector('meta[name="color-scheme"]');
  if (m && (t === "light" || t === "dark")) {
    m.content = t;
  }
} catch {
  /* follow system theme */
}
