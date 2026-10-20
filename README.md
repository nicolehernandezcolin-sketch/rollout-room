# Rollout Room

A calmer way for creatives to run their socials. Set a goal, see Instagram, TikTok, YouTube and X numbers in one place (each platform on its own and all together), get a posting plan built from your own results, approve every post yourself, and share a live media kit with brands, venues and sponsors.

The aim is quality over quantity: post on a cadence your numbers say works and your schedule can keep up, instead of chasing the algorithm until you burn out.

**Live site:** https://nicolehernandezcolin-sketch.github.io/rollout-room/

## What's in it

- **Sign-up and onboarding**: your world, your goal, your platforms, and how many hours a week you can give it.
- **Dashboard**: goal progress (needed pace vs. your pace), combined followers, reach and engagement, a card for each platform, and plain-language insights from your data.
- **Analytics**: followers over time, best days and times, the posting cadence that stops paying off, formats compared, top posts, and audience age, gender and cities.
- **Plan**: Claude reads your numbers and your time budget, then writes a cadence for each platform, content pillars, world-building rules, experiments and a runway to your next launch.
- **Queue**: you write the captions. Claude's suggestions are optional starting points. Nothing is approved until you approve it. X posts get a 280-character counter and can be written as threads.
- **Vault**: the footage and photos you already have, ready to bring back with a new angle.
- **Media kit**: your numbers fill in automatically. Share it as a link or copy it as text for an email.

## Your data and security

Rollout Room is built so creators keep control of their work, including keeping it out of AI training.

- **Accounts:** email and password, with email confirmation. Passwords must be at least 10 characters.
- **End-to-end encrypted workspace:** your profile, plan, queue, captions, vault notes and check-ins are encrypted in your browser (AES-256-GCM) before they're saved. The database only ever holds scrambled data.
- **The server never sees your password:** the browser derives two separate values from it (PBKDF2-SHA-256, 600,000 rounds). One signs you in; the other unlocks your workspace key and never leaves your device. Even someone with full database access can't read a workspace.
- **Recovery code:** you get one at sign-up. It's the only way back in if you forget your password; without it, a reset starts you over with an empty workspace. You can make a new code in Settings.
- **Stay unlocked on this device:** optional. The key is kept in the browser in a form scripts can't export. Signing out removes it.
- **What isn't encrypted:** your email address, the names of items (e.g. "post" or "vault item", not their content), and your media kit once you publish a link, because partners need to read it.
- **AI:** when you ask for suggestions or a plan, the details needed for that request go over HTTPS to Claude's API to write the answer. Nothing is stored on the server afterwards, and Anthropic doesn't train its models on API data by default.
- **Delete:** Settings → Delete my account removes the account and everything in it.

## Demo mode vs. connected mode

With `config.js` empty, the site runs as a **demo**: everything works with sample data and saves in your browser, but Claude suggestions, AI plans and media kit links are turned off.

Connecting a Supabase project turns on password-protected accounts with an end-to-end encrypted workspace, saving across devices, Claude suggestions and plans, and shareable media kit links.

Instagram, TikTok, YouTube and X numbers are still **sample data** in both modes. Real connections need each platform's own sign-in (OAuth) and app review; see "Connecting the platforms" below.

## Turn on accounts and Claude (one-time setup)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project's **SQL editor**, run everything in [`supabase/migrations/0001_rollout.sql`](supabase/migrations/0001_rollout.sql).
3. In **Authentication → Sign In / Providers**, keep Email turned on with **Confirm email** enabled. In **Authentication → URL Configuration**, set the Site URL to `https://nicolehernandezcolin-sketch.github.io/rollout-room/` and add the same address under Redirect URLs.
4. Get an API key at [console.anthropic.com](https://console.anthropic.com). Requests are billed to that account. Each creator is capped at 40 requests a day, which you can change with `DAILY_AI_LIMIT`.
5. Install the Supabase CLI and deploy the two server functions. The project ref is in Project Settings → General.

   ```bash
   brew install supabase/tap/supabase
   ```

   ```bash
   supabase login
   ```

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

   ```bash
   supabase secrets set ANTHROPIC_API_KEY=YOUR_KEY
   ```

   ```bash
   supabase functions deploy rollout-ai
   ```

   ```bash
   supabase functions deploy delete-account
   ```

6. Put the project URL and publishable (anon) key in [`config.js`](config.js), then commit and push. GitHub Pages updates in about a minute.

The function uses Claude Opus 5 with server-side fallback on, so if a request is declined it retries on a fallback model inside the same call.

## Connecting the platforms

Each platform has its own developer program. The site would send people to the platform's sign-in, store the token on the server, publish approved posts at their scheduled time, and pull stats every night.

| Platform | API | What it allows |
|---|---|---|
| Instagram | Instagram API with Instagram Login | Publish Reels, carousels and photos; read reach, saves and audience insights (Business or Creator accounts) |
| TikTok | Content Posting API + Display API | Send videos to the creator's TikTok inbox as drafts to finish in the app, or post directly after TikTok audits the app; read followers and per-video stats |
| YouTube | YouTube Data API + YouTube Analytics API | Upload Shorts; read views and audience stats |
| X | X API v2 | Publish posts and threads; read post metrics (needs an X developer account; check X's current API pricing) |

Meta and TikTok review apps before they can post or read stats for other people's accounts. A posting service like Ayrshare already has those approvals and is the fastest way to start.

## Working on it

Everything lives in this folder. Edit, then:

```bash
git add -A && git commit -m "Describe the change" && git push
```

GitHub Pages publishes `main` automatically.

To refresh the Claude artifact copy of the app, run `scripts/artifact-copy.sh`. It writes `dist/artifact.html` without the website-only header.
