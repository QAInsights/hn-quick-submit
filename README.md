# HN Quick Submit

A Chrome extension for posting links to [Hacker News](https://news.ycombinator.com)
in one click — from the toolbar icon or the right-click menu.

## Features

- **Toolbar popup**: prefills the current tab's title and URL; add an optional
  comment (posted as the first comment on the thread) and submit.
- **Context menu**: right-click a page, link, or text selection to submit.
- **Two modes**: confirm-everything (default) or submit immediately with a
  notification on success.
- **Direct engine**: posts via HN's own form endpoint (`/r`) using your existing
  browser session; falls back to the official `submitlink` prefill URL if the
  direct post is rejected.
- **Settings**: HN login status, submission mode, light/dark/system theme,
  About, and a donate link.

## Development

```sh
npm install
npm run dev        # dev build + HMR via @crxjs
npm run build      # production build → dist/
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # vitest unit tests
```

Load `dist/` at `chrome://extensions` with Developer mode enabled
(**Load unpacked**).

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab` | Prefill title/URL in the toolbar popup |
| `contextMenus` | Right-click "Submit to Hacker News" entries |
| `notifications` | Result toast in instant mode |
| `storage` | Settings (theme, submission mode) |
| `host_permissions: news.ycombinator.com` | Read `fnid` and post to `/r` with your session cookie |

No credentials are stored; the extension uses the browser's existing
Hacker News login session.
