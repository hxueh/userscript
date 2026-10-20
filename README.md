# userscript

My userscripts, mostly lighter and calmer versions of sites I use on a phone-sized
screen. This repo is the source of truth. Every push to `main` that touches a
script is synced to Greasyfork through a GitHub webhook, so the Greasyfork page
is where you install from and this repo is where the code lives.

## Install

Install a userscript manager first (Tampermonkey or Violentmonkey both work in
Chrome and Brave), then open a script's Greasyfork page and click **Install**.
Updates arrive through the manager's normal update check.

| Script | What it does | Install |
| --- | --- | --- |
| YouTube Mobile Lite | iOS-style video feed with no Shorts, native comments, DASH/HLS playback, background audio | [600230](https://greasyfork.org/en/scripts/600230) |
| SponsorBlock Lite | Skips sponsor segments automatically on YouTube and Bilibili | [560869](https://greasyfork.org/en/scripts/560869) |
| PiPifier | Picture-in-Picture button for YouTube videos | [560887](https://greasyfork.org/en/scripts/560887) |
| Bilibili Mobile Lite | iOS-style feed, creator pages, native comments, DASH playback, background audio | [589625](https://greasyfork.org/en/scripts/589625) |
| Instagram Lite | iOS 26 look without Reels, ads or suggested posts | [600638](https://greasyfork.org/en/scripts/600638) |
| X Lite | Liquid-glass tabs and cards, mobile dock, no sidebar or Grok | [600670](https://greasyfork.org/en/scripts/600670) |
| Xiaohongshu Lite | Phone-style web with a tab bar, Recommend-only feed, full-screen image viewer | [600561](https://greasyfork.org/en/scripts/600561) |
| Douban Mobile Lite | Full-page interface for m.douban.com with search, broadcasts, books, films and groups | [600461](https://greasyfork.org/en/scripts/600461) |
| JD Mobile Lite | iOS styling for JD's mobile web, minus app prompts and overlays | [589941](https://greasyfork.org/en/scripts/589941) |
| JD Lite | Desktop JD reduced to search, product, SKU and buy buttons, without tracking, ads or AI features; responsive down to phone width | [600734](https://greasyfork.org/en/scripts/600734) |
| Taobao & Tmall Mobile Lite | Search-first mobile interface with fewer prompts, ads and recommendations | [589946](https://greasyfork.org/en/scripts/589946) |
| Taobao & Tmall Lite | Desktop Taobao and Tmall reduced to search, product, SKU and buy buttons; responsive down to phone width | [600695](https://greasyfork.org/en/scripts/600695) |
| Ctrip Mobile Lite | iOS 27 Liquid Glass look for m.ctrip.com with a floating tab bar and dark mode; blocks analytics, ad and app wake-up scripts, and removes ads and app prompts | [601079](https://greasyfork.org/en/scripts/601079) |
| Feishu Messenger Lite | Liquid Glass look for Feishu's web messenger (`/next/messenger`): glass sidebar, panels and menus, Solarized Light by day and Tokyo Night by night; blocks Tea, Slardar and ad trackers, and removes "Download Feishu" | [601213](https://greasyfork.org/en/scripts/601213) |
| WSJ Dark Mode | Follows the system theme and darkens all WSJ pages, with photos and video kept in true color | [560962](https://greasyfork.org/en/scripts/560962) |
| Max: Always Highest Video Quality | Pins Max (HBO Max) to the top rung of each quality tier so adaptive bitrate never drops to 234p | [600723](https://greasyfork.org/en/scripts/600723) |

Source files live in `scripts/`, one per script, named `<name>.user.js`.

## Changing a script

1. Edit the file in `scripts/`.
2. Bump `@version` in the same commit. Greasyfork only delivers an update when
   the version changes, and the `version-bump` workflow fails any push or PR that
   changes a script without bumping it.
3. Push to `main`.

A few things to leave alone:

- Don't add `@downloadURL` or `@updateURL`. Greasyfork injects its own when it
  serves the code, and a second copy in the source would be duplicated.
- Don't rename a file. Each script's sync URL points at its path on
  `raw.githubusercontent.com`, so a rename breaks that script's sync until the URL
  is updated on Greasyfork.
- Touch only the scripts you mean to change. The webhook re-syncs every script
  whose file appears in the pushed commits.

## How the sync works

Greasyfork has no upload API. Its webhook receives GitHub's push event, reads
the list of files changed in the pushed commits, and re-fetches each script whose
**sync URL** matches one of them. A README-only commit therefore updates
nothing, which is the behavior we want.

## One-time setup

Only needed when setting up a new account or adding a script.

**Per script.** On the script's Greasyfork **Admin** page, under *Source
Syncing*, set the sync type to *Automatic* and the URL to the raw file:

```
https://raw.githubusercontent.com/hxueh/userscript/main/scripts/<name>.user.js
```

**Once per repo.** Copy the secret from
<https://greasyfork.org/en/users/webhook-info>, then add a webhook under
GitHub Settings → Webhooks:

- Payload URL: `https://api.greasyfork.org/en/users/36282-hxueh/webhook`
  (the exact URL is on the webhook-info page; the older
  `greasyfork.org/en/users/webhook` form returns 404)
- Content type: `application/json`
- Secret: the value from the webhook-info page
- Events: just the push event

**Checking it.** After a push, open the webhook's **Recent Deliveries** on
GitHub. A 200 means Greasyfork received it, and the script's page should show
the new version within a minute.

## Adding a new script

Create the script on Greasyfork, set its sync URL as above, add the file under
`scripts/`, and add a row to the table at the top of this README.
