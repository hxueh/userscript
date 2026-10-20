# AGENTS.md

Guidance for AI agents working in this repo. See `README.md` for the script
list and the Greasyfork setup.

## Layout

- `scripts/*.user.js` holds one userscript per file.
- `libraries/*.js` holds code shared by several scripts, published on
  Greasyfork as libraries. A script loads one with `@require` and a
  versioned Greasyfork URL. Do not use `lib/` (it is in the global gitignore).
- `.github/workflows/version-bump.yml` fails a push or PR that changes a script
  without changing its `@version`.

## Rules for editing a script

- Bump `@version` in the same commit as any code change. Greasyfork delivers an
  update to users only when the version changes.
- Do not add `@downloadURL` or `@updateURL`. Greasyfork injects them when it
  serves the code, so a copy in the source would be duplicated.
- Keep the file name stable. The Greasyfork sync URL points at
  `https://raw.githubusercontent.com/hxueh/userscript/main/scripts/<file>`, so
  renaming a file breaks the sync until the URL is updated on Greasyfork.
- Touch only the scripts you mean to change. The webhook re-syncs every script
  whose file appears in the pushed commits.

## Changing a library

- Bump the library's `@version` and push. Greasyfork syncs it like a script.
- Scripts load the latest library through the unversioned URL
  (`https://update.greasyfork.org/scripts/<id>/<name>.js`), so do not pin a
  version in `@require`.
- Userscript managers fetch a `@require` again only when the script itself
  updates. To ship a library change at once, also bump the `@version` of each
  script that uses it.
- Keep the library's API backward compatible, because every script gets the
  new version.

## Publishing

Pushing to `main` is the release. Greasyfork's webhook syncs the changed
scripts; there is nothing to upload by hand. A new script needs a one-time
setup on Greasyfork (create it, set its Sync URL) and a row in the README table.

## Commits

Use Conventional Commits with a concise summary and a detailed body, for
example `fix(bilibili): ...` or `feat(youtube): ...`. Commits are signed; never
disable signing.
