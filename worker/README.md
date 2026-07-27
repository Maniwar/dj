# Guestbook intake Worker

Screens guestbook submissions from club-humidity.com and files each one as an issue in the
**private** queue repo. Nothing is stored here and nothing is published.

## The shape of it

    visitor → Worker (honeypot · length · no-links · Turnstile · rate limit)
            → GitHub issue in Maniwar/club-humidity-guestbook
            → you approve → paste into src/data/guestbook.seed.ts → commit → deploy

The public wall stays a **static file in the site build**. That is the point: spam cannot reach
the site, because publishing requires a human and a git push. The tradeoff is that entries appear
on your deploy cadence rather than instantly — which is period-correct for a Y2K guestbook anyway.

## Why a Worker instead of posting to GitHub from the page

A token that can open issues must never reach the browser. This is the one place a secret can live
that the visitor cannot read. It is also the only place limits mean anything: anything enforced in
the page is enforced by code the submitter controls.

## Setup

1. **Turnstile** — Cloudflare dashboard → Turnstile → add a widget for `club-humidity.com`.
   Keep the **site key** (public, goes in the front end) and the **secret key**.

2. **GitHub token** — a *fine-grained* PAT, scoped to `club-humidity-guestbook` ONLY, with
   **Issues: Read and write**. Nothing else. If this Worker were ever compromised, the blast
   radius should be "someone can file issues in a repo nobody reads."

3. Deploy:

       cd worker
       npx wrangler secret put GITHUB_TOKEN
       npx wrangler secret put TURNSTILE_SECRET
       npx wrangler deploy

4. Put the Worker URL and the Turnstile **site key** into the site's `.env`:

       VITE_GUESTBOOK_ENDPOINT=https://club-humidity-guestbook.<subdomain>.workers.dev
       VITE_TURNSTILE_SITE_KEY=0x4AAA...

## What is a secret and what is not

| Safe in git | Never in git |
|---|---|
| Turnstile **site** key | Turnstile **secret** key |
| Worker URL | GitHub token |
| `ALLOWED_ORIGIN`, `QUEUE_REPO` | |

The rule: anything the browser must receive is already public. Anything that grants server-side
authority is not.

## Screening, and why each check earns its place

- **Honeypot** (`website`) — hidden from people, filled by bots. Returns `ok: true` on purpose:
  telling a bot it failed teaches it to retry; letting it think it succeeded makes it stop.
- **No links** — spam that bothers with a guestbook is after a link. Rejecting URLs removes the
  motive rather than the symptom, and costs a real visitor nothing.
- **280 characters** — period-correct, and long spam payloads do not fit.
- **Turnstile** — the actual defence. Everything above is cheap screening for what gets past it.
- **Rate limit** — per-IP, 5/hour.
- **Global daily cap** — 200 issues/day, whatever the source. This is the one that actually
  holds: per-IP limits are trivially evaded by rotating addresses, so the cap is what bounds a
  determined attacker. Past it, submissions are silently dropped and answered as success.

## What an attacker can actually achieve

Worth being precise, because the answer shapes how much defence is warranted.

| | Possible? |
|---|---|
| Get spam onto club-humidity.com | **No.** The wall is a static file; publishing needs a commit |
| Deface or alter the site | **No.** No write path exists |
| Read anything | **No.** The Worker only writes |
| Flood the issue queue | Bounded at `DAILY_CAP` |
| Burn Worker requests | Cloudflare free tier is 100k/day |

The worst realistic outcome is a quiet day for the guestbook and some issues to bulk-close. That
is why there is no elaborate defence here: the architecture removes the prize, and the rest is
housekeeping. **Set up the KV namespace** — without it both limits are skipped.
