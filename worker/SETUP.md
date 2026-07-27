# Guestbook setup — your steps

Everything below is done once. Until step 6 the live site is unchanged: with no endpoint
configured the guestbook stays the private per-device wall it already is.

---

## 1. Cloudflare account

If you don't have one: <https://dash.cloudflare.com/sign-up>. Free, no card. You do **not** need to
move your domain to Cloudflare — the Worker runs on a `workers.dev` URL and the site stays on
GitHub Pages.

## 2. Turnstile widget → two keys

Cloudflare dashboard → **Turnstile** → **Add widget**.

- **Widget name:** `club humidity guestbook`
- **Hostnames:** `club-humidity.com` (add `localhost` too if you want to test locally)
- **Widget mode:** Managed

You get two keys. They are **not** interchangeable:

| Key | Looks like | Where it goes |
|---|---|---|
| **Site key** | `0x4AAAA...` | the website — public, committed |
| **Secret key** | `0x4AAAA...` | Worker secret only — never committed |

## 3. GitHub token

<https://github.com/settings/personal-access-tokens/new> — the **fine-grained** page, not classic.

- **Token name:** `club-humidity-guestbook worker`
- **Expiration:** 1 year (put a reminder somewhere; the Worker starts returning errors when it
  lapses, and the failure is silent from a visitor's point of view)
- **Repository access:** *Only select repositories* → **club-humidity-guestbook**
- **Permissions:** *Repository permissions* → **Issues** → **Read and write**. Nothing else.

Copy the token now — GitHub shows it once.

> Scope matters more than anything else here. If this Worker were ever compromised, the whole
> blast radius should be "someone can file issues in a repo that contains nothing."

## 4. KV namespace (flood control)

```sh
cd worker
npx wrangler login          # opens a browser
npx wrangler kv namespace create RATE
```

It prints something like:

```
[[kv_namespaces]]
binding = "RATE"
id = "abc123..."
```

Paste that into `worker/wrangler.toml`, replacing the commented-out block at the bottom.

**Don't skip this.** Without the binding, both the per-IP limit and the daily cap are skipped
silently. Turnstile still stops bots, but nothing bounds a determined human.

## 5. Deploy the Worker

```sh
cd worker
npx wrangler secret put GITHUB_TOKEN       # paste the token from step 3
npx wrangler secret put TURNSTILE_SECRET   # paste the SECRET key from step 2
npx wrangler deploy
```

The last command prints your Worker URL:

```
https://club-humidity-guestbook.<your-subdomain>.workers.dev
```

Copy it.

## 6. Point the site at it

Create **`.env.production`** in the repo root:

```
VITE_GUESTBOOK_ENDPOINT=https://club-humidity-guestbook.<your-subdomain>.workers.dev
VITE_TURNSTILE_SITE_KEY=0x4AAAA...
```

**Commit this file.** Both values are public by design — they ship in the JS bundle either way, and
committing them means the GitHub Actions build picks them up with no workflow changes. The secrets
from steps 2 and 3 live only in Cloudflare and are never in git.

```sh
git add .env.production
git commit -m "Enable the guestbook: worker endpoint and Turnstile site key"
git push
```

Wait for Actions to deploy.

## 7. Test it

Open club-humidity.com, scroll to the guestbook, and post something.

- You should see a Turnstile checkbox appear above the POST button
- Your entry appears in the wall immediately (that's the local echo — it always did this)
- You should see **`>> ENTRY RECEIVED. THE DOOR STAFF ARE REVIEWING IT. <<`**
- A new issue appears at
  <https://github.com/Maniwar/club-humidity-guestbook/issues>

If the issue doesn't appear, check the Worker log:

```sh
cd worker && npx wrangler tail
```

Then post again and watch what it prints.

## 8. Turn off notifications

<https://github.com/Maniwar/club-humidity-guestbook> → **Watch** → **Ignore**.

Otherwise every submission emails you, which is the exact thing this design was built to avoid.

---

## Approving an entry

1. Read the issue.
2. Add it to `src/data/guestbook.seed.ts`, matching the shape of the entries already there.
3. Commit, push, let Actions deploy.
4. Close the issue.

The public wall is a static file, so an entry is live the moment that deploy finishes — and
nothing reaches the site any other way.

## If it ever gets flooded

```sh
gh issue list --repo Maniwar/club-humidity-guestbook --state open --limit 500 \
  --json number --jq '.[].number' \
  | xargs -I{} gh issue close {} --repo Maniwar/club-humidity-guestbook
```

Or delete the repo and recreate it — it holds nothing but submissions, and the Worker resumes as
soon as it exists again.
