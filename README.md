# userscript

Source of truth for my userscripts. Each push to `main` that touches a script
is synced to Greasyfork through its GitHub webhook.

| File | Greasyfork |
| --- | --- |
| `scripts/youtube-mobile-lite.user.js` | [600230](https://greasyfork.org/en/scripts/600230) |
| `scripts/sponsorblock-lite.user.js` | [560869](https://greasyfork.org/en/scripts/560869) |
| `scripts/instagram-lite.user.js` | [600638](https://greasyfork.org/en/scripts/600638) |
| `scripts/bilibili-mobile-lite.user.js` | [589625](https://greasyfork.org/en/scripts/589625) |
| `scripts/xiaohongshu-lite.user.js` | [600561](https://greasyfork.org/en/scripts/600561) |
| `scripts/douban-mobile-lite.user.js` | [600461](https://greasyfork.org/en/scripts/600461) |
| `scripts/pipifier.user.js` | [560887](https://greasyfork.org/en/scripts/560887) |
| `scripts/jd-mobile-lite.user.js` | [589941](https://greasyfork.org/en/scripts/589941) |
| `scripts/taobao-tmall-mobile-lite.user.js` | [589946](https://greasyfork.org/en/scripts/589946) |

## How the sync works

Greasyfork has no upload API. Its webhook receives GitHub's push event, looks
at the files changed in the pushed commits, and re-fetches any script whose
**sync URL** matches one of them. So only the scripts you touched are updated.

Bump `@version` whenever you change a script; users only get an update when it
changes (CI enforces this).

## One-time setup

1. On Greasyfork, open each script's **Admin** tab, then **Sync**. Set the sync
   type to *Automatic* and the URL to the raw file, for example:
   `https://raw.githubusercontent.com/hxueh/userscript/main/scripts/pipifier.user.js`
2. Copy your webhook secret from <https://greasyfork.org/en/users/webhook-info>.
3. In the GitHub repo, go to Settings, Webhooks, Add webhook:
   - Payload URL: `https://greasyfork.org/en/users/webhook`
   - Content type: `application/json`
   - Secret: the value from step 2
   - Events: just the push event
