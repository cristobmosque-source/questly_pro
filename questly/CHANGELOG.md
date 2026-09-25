# Changelog

All notable changes to Questly are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [1.5.0] — 2026-08-30

### Added

- **Quests can have a description and a list of steps.** Steps are entered one
  per line; a child ticks them off and can't finish the quest until they're
  all done. Progress is tracked per child per period and resets after each
  completion, so a repeatable quest starts fresh each go. Editing the list
  keeps the ticks on steps whose wording didn't change.
- **Notification channels can be edited and paused**, not just added and
  deleted. A grown-up manages their own channels and every child's. Secrets
  can be left blank in the edit form to keep the stored value.

### Fixed

- **Discord notifications returned 403.** Discord sits behind Cloudflare,
  which rejects the default `Python-urllib` User-Agent with error 1010 before
  the request reaches the API. Every outbound request now sends a proper
  User-Agent.
- **The Discord webhook URL was a masked password field**, so it couldn't be
  checked after saving. It's now readable text, with a note that it should
  still be treated as a secret.
- **Long values broke the layout on a phone.** A Discord webhook URL or a
  Signal group id would push the notifications card wider than the screen.
  They now wrap.

## [1.4.0] — 2026-08-30

### Added

- **Quests can be done more than once in a period.** A new *Times each* field
  sets how many goes are available — a tidy-up round worth doing three times a
  day, say. Children see "1 of 3 done" on the card and the **Done!** button
  stays until they've used them all. Existing quests are unaffected and stay
  at one.

### Fixed

- **Form controls on the quest form were different heights.** The icon box
  rendered 58px against 49px for its neighbours, because the larger emoji font
  combined with padding that a more specific rule was overriding. Every
  control in a form row is now a uniform 48px.

### Notes

- The uniqueness index on quest claims now includes an occurrence number, so
  simultaneous taps still can't create a duplicate claim. The old index is
  dropped automatically on first run.

## [1.3.1] — 2026-08-30

### Fixed

- **"Find my groups" now explains an empty result.** A Signal bridge running
  in `normal` or `native` mode only learns about groups when something calls
  `receive`; until then the group list is legitimately empty. Questly used to
  report a bare "no groups", which looked like a bug. It now checks the
  bridge's mode and tells you exactly what to do.
- Group ids fall back to `internal_id`, and a wrapped `{"groups": [...]}`
  response is accepted, for compatibility across bridge versions.
- The outbound HTTP timeout went from 10s to 30s, overridable with
  `NOTIFY_TIMEOUT`. In `normal` mode the bridge starts a JVM per request and a
  cold first call can exceed ten seconds.

## [1.3.0] — 2026-08-30

### Added

- **Signal group chats.** A Signal channel can send to a group as well as to
  individuals. Because group ids are long base64 strings, there's a *Find my
  groups* button that asks the bridge which groups your number is in and lets
  you pick one by name.
- **Signal messages are formatted.** Sent with `text_mode: styled`, so the
  title arrives in bold rather than as a run-on line.

### Changed

- **Notifications carry the detail needed to act on them.** A purchase alert
  now names the child and item and gives the cost, the child's remaining
  balance, the item's description and what to do next. A finished-quest alert
  names the child and quest and gives how often it repeats, what it pays and
  the child's current balance. Points, approvals and new shop items gained
  similar context.

## [1.2.0] — 2026-08-30

### Added

- **Notifications.** Every notable event is recorded in an in-app feed with an
  unread badge, for children and grown-ups alike. Children are told about new
  shop items, decisions on their quests and purchases, points awarded, and
  when they can finally afford what they're saving for; grown-ups are told
  when something needs approving.
- **Per-person delivery channels.** On top of the in-app feed, each person can
  have their own channels — ntfy, Signal (via a self-hosted
  signal-cli-rest-api bridge), Gotify, Telegram, Discord, Pushover, or a plain
  webhook. So a young child can see notifications only in the app while an
  older one gets a push on their tablet. Channels can be limited to particular
  kinds of update, and each has a Test button.

### Notes

- Sends run on a background thread; a slow or unreachable endpoint never
  delays the app, and failures are logged rather than surfaced to a child.
- Channel settings, which include tokens, are stored in the database as
  entered. Keep the database on trusted storage.
- The feed is capped at 90 days by a TTL index.
- Lock-screen Web Push is deliberately not used: it requires HTTPS (and, on
  iOS, home-screen installation), which a plain-HTTP home deployment can't
  provide. Outbound channels avoid that constraint.

## [1.1.0] — 2026-08-21

### Added

- **Save up for a chosen reward.** A child can pick any reward in the shop and
  their home screen tracks progress toward that one, instead of always showing
  whichever is closest. Deleting a reward clears it from anyone saving for it.
- **Themes.** Eight looks — Grape, Bubblegum, Ocean, Jungle, Sunset, Space,
  Dino and Unicorn — that children pick for themselves from a new *Look* tab.
  Each changes their accent colour and page background, and the accent carries
  through to how grown-ups see them.
- **Refilling shop stock.** A reward can now be unlimited, a fixed number that
  runs out, or an allowance that refills — "2 a day each" or "1 a month for the
  family to share", daily, weekly or monthly, scoped per child or across
  everyone. Allowances reset on their own, and rejecting a purchase frees the
  slot again.
- **Stay signed in.** Grown-ups get a "keep me signed in" tick on login, and
  their email is remembered to save typing. The password never is, and there's
  a "forget this email" link.

### Changed

- A reward form that omits the stock mode now infers it from whether a stock
  number was supplied, rather than silently making the reward unlimited.

## [1.0.2] — 2026-08-21

### Fixed

- Published images no longer carry buildx provenance/SBOM attestations.
  These turned the manifest into an OCI image index containing
  `unknown/unknown` entries, which tools expecting the older Docker
  manifest-list media type read as a missing tag — Unraid Community
  Applications' scanner among them, blocking the listing.

## [1.0.1] — 2026-08-21

No changes to the app itself — this release exists to publish container images
and list Questly on Unraid.

### Added

- Multi-architecture container images (`linux/amd64`, `linux/arm64`) published
  automatically on every tag to GitHub Container Registry, and to Docker Hub
  once a token is configured. The workflow smoke-tests the published image
  before finishing.
- `ca_profile.xml` and `templates/questly.xml` so Questly can be listed in
  Unraid Community Applications.
- Docs and screenshots are now excluded from the image, trimming its size.

## [1.0.0] — 2026-08-21

First release.

### Added

**Kids**

- Sign in by tapping your face on the front page, then a 4–6 digit PIN on a
  large keypad — or no PIN at all, for children too young to manage one.
- A home screen with a progress bar counting down to the next reward you can't
  yet afford, today's quests, and your recent points.
- A quest list with **Done!** buttons that send a claim to a grown-up.
- A shop separating what you can buy now from how many points short you are of
  the rest.
- A history page with lifetime totals, rewards won and a running balance.
- Confetti and a message when something lands.

**Grown-ups**

- Quick `+10 / +25 / +50 / +100` award buttons per child, plus custom amounts
  and take-aways, each with an optional reason.
- A quest board: daily, weekly or one-off quests worth a set number of points,
  assigned to specific children or to everyone.
- A shop editor: title, icon, description, cost and optional limited stock,
  with items hideable without deleting them.
- One approvals page for every purchase and quest claim awaiting a decision,
  with a count badge in the navigation.
- Family management — add, edit and remove children, set or clear their PINs,
  and add or remove other grown-ups.
- An account page for your own name, login email, icon and password. Either
  grown-up can reset the other's password, confirmed with their own.

**Behaviour**

- Balances can never go negative, and repeated taps on **Buy** cannot overdraw
  one — the deduction is a conditional atomic update.
- Two children racing for the last limited-stock item cannot both win it.
- Daily quests can be claimed once per calendar day and weekly ones once per
  ISO week, in the configured timezone.
- Rejecting a purchase refunds the points and restores the stock; rejecting a
  quest claim lets the child try again in the same period.
- Every point movement is written to a ledger with the balance after it.

**Operations**

- Docker Compose stack with a bundled MongoDB, or point `MONGO_URI` at one you
  run yourself and start only the web service.
- First-run setup wizard, plus `seed-demo` and `create-parent` CLI commands.
- A `/healthz` endpoint wired to the container health check.
- `tests/smoke_test.py` — 53 end-to-end checks against a real MongoDB, guarded
  so it can only run against a database named `*_test`.

**Interface**

- Installable to a phone or tablet home screen, with a web app manifest and a
  full icon set generated from a single spec by `tools/make_icons.py`.
- Safe-area padding throughout, so nothing hides behind an iOS status bar or
  home indicator when running full-screen.
- CSRF protection on every mutation, and route guards keeping children out of
  grown-up pages.

[Unreleased]: https://github.com/mahansford/questly/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/mahansford/questly/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/mahansford/questly/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/mahansford/questly/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/mahansford/questly/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/mahansford/questly/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/mahansford/questly/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/mahansford/questly/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/mahansford/questly/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/mahansford/questly/releases/tag/v1.0.0
