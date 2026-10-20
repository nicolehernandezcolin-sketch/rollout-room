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

## Your data

- Your content, captions and numbers belong to you. They're stored only to show you your own workspace.
- No one else can see your workspace. A media kit is public only when you create a link for it.
- Suggestions and plans go to Claude's API only to write the answer, and nothing is kept on the server afterwards. Anthropic doesn't train its models on API data by default.
- Settings → Start over deletes everything, including your media kit link.

## Demo mode vs. connected mode

With `config.js` empty, the site runs as a **demo**: everything works with sample data and saves in your browser, but Claude suggestions, AI plans and media kit links are turned off.

Connecting a Supabase project turns on email sign-up, saving across devices, Claude suggestions and plans, and shareable media kit links.

Instagram, TikTok, YouTube and X numbers are still **sample data** in both modes. Real connections need each platform's own sign-in (OAuth) and app review; see "Connecting the platforms" below.

## Turn on accounts and Claude (one-time setup)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project's **SQL editor**, run everything in [`supabase/migrations/0001_rollout.sql`](supabase/migrations/0001_rollout.sql).
3. In **Authentication → URL Configuration**, set the Site URL to `https://nicolehernandezcolin-sketch.github.io/rollout-room/` and add the same address under Redirect URLs.
4. Get an API key at [console.anthropic.com](https://console.anthropic.com). Requests are billed to that account. Each creator is capped at 40 requests a day, which you can change with `DAILY_AI_LIMIT`.
5. Install the Supabase CLI and deploy the Claude function. The project ref is in Project Settings → General.

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
