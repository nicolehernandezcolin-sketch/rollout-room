// Connects a creator's Instagram, TikTok, YouTube, X and Threads accounts through Upload-Post, publishes the
// posts they approve, and reads their account and post stats. The Upload-Post key stays here on the server.
// Each creator gets their own Upload-Post profile, named from their account id (never their email).

import { createClient } from 'npm:@supabase/supabase-js@^2';

const API = 'https://api.upload-post.com';
const KEY = Deno.env.get('UPLOAD_POST_API_KEY') ?? '';
const SITE = Deno.env.get('SITE_URL') ?? 'https://nicolehernandezcolin-sketch.github.io/rollout-room/';
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// Rollout Room's platform keys and Upload-Post's names for them.
const PLATFORM = { ig: 'instagram', tt: 'tiktok', yt: 'youtube', x: 'x', th: 'threads' } as const;
type Key = keyof typeof PLATFORM;
const isKey = (k: unknown): k is Key => typeof k === 'string' && k in PLATFORM;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

class UploadPostError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Json = Record<string, unknown>;
async function up(path: string, init: { method?: string; json?: Json; form?: FormData; query?: Record<string, string> } = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = { Authorization: `Apikey ${KEY}` };
  let body: BodyInit | undefined;
  if (init.json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(init.json); }
  if (init.form) body = init.form;
  const res = await fetch(url, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body });
  let data: Json | null = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { ok: res.ok, status: res.status, data: (data ?? {}) as Json };
}
const message = (data: Json, fallback: string) =>
  String(data.message ?? data.error ?? fallback).slice(0, 300);

const profileName = (uid: string) => `rr-${uid}`;

async function ensureProfile(uid: string) {
  const r = await up('/api/uploadposts/users', { json: { username: profileName(uid), display_name: 'Rollout Room creator' } });
  if (!r.ok && r.status !== 409) throw new UploadPostError(r.status, message(r.data, 'Could not set up your connection profile.'));
}

async function accounts(uid: string) {
  const r = await up(`/api/uploadposts/users/${profileName(uid)}`);
  if (r.status === 404) return {};
  if (!r.ok) throw new UploadPostError(r.status, message(r.data, 'Could not read your connected accounts.'));
  const social = ((r.data.profile as Json)?.social_accounts ?? {}) as Json;
  const out: Record<string, Json> = {};
  for (const k of Object.keys(PLATFORM) as Key[]) {
    const a = social[PLATFORM[k]];
    if (a && typeof a === 'object') {
      const acct = a as Json;
      out[k] = {
        handle: acct.handle ?? acct.display_name ?? acct.username ?? '',
        name: acct.display_name ?? '',
        avatar: acct.social_images ?? '',
        reauth: !!acct.reauth_required,
      };
    }
  }
  return out;
}

// Runs async work over a list a few at a time, to stay inside Upload-Post's rate limits.
async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

const pick = (o: Json, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const ACCOUNT_FIELDS = ['followers', 'reach', 'views', 'impressions', 'profileViews', 'likes', 'comments', 'shares', 'saves', 'reach_timeseries', 'follower_demographics', 'watch_time_minutes'];
const POST_FIELDS = ['likes', 'comments', 'views', 'reach', 'impressions', 'saves', 'shares', 'favorites', 'new_followers'];
const POSTS_PER_PLATFORM = 8;

async function stats(uid: string, keys: Key[]) {
  const user = profileName(uid);
  const names = keys.map((k) => PLATFORM[k]);
  const acct = await up(`/api/analytics/${user}`, { query: { platforms: names.join(',') } });
  if (!acct.ok) throw new UploadPostError(acct.status, message(acct.data, 'Could not read your stats.'));
  const out: Record<string, Json> = {};
  for (const k of keys) {
    const a = (acct.data[PLATFORM[k]] ?? {}) as Json;
    const media = await up('/api/uploadposts/media', { query: { platform: PLATFORM[k], user, limit: String(POSTS_PER_PLATFORM) } });
    const items = media.ok ? ((media.data.media ?? []) as Json[]).slice(0, POSTS_PER_PLATFORM) : [];
    const posts = await pool(items, 3, async (item) => {
      const m = await up('/api/uploadposts/post-analytics', { query: { platform_post_id: String(item.id), platform: PLATFORM[k], user } });
      const metrics = m.ok ? (((m.data.platforms as Json)?.[PLATFORM[k]] as Json)?.post_metrics ?? {}) as Json : {};
      return {
        id: String(item.id), caption: String(item.caption ?? '').slice(0, 2200), type: String(item.media_type ?? ''),
        url: String(item.permalink ?? ''), time: String(item.timestamp ?? ''), metrics: pick(metrics, POST_FIELDS),
      };
    });
    out[k] = { account: pick(a, ACCOUNT_FIELDS), posts };
  }
  return out;
}

const firstLine = (s: string) => (s.split('\n').find((l) => l.trim()) ?? s).trim();

async function publish(uid: string, input: Json) {
  const k = input.platform;
  if (!isKey(k)) throw new UploadPostError(400, 'That platform can’t be posted to yet.');
  const kind = input.kind === 'video' || input.kind === 'photos' ? input.kind : 'text';
  const caption = String(input.caption ?? '').slice(0, 10000);
  const media = (Array.isArray(input.media) ? input.media : []).map(String);
  if (media.some((p) => !p.startsWith(`${uid}/`))) throw new UploadPostError(400, 'Bad media path.');
  if (kind !== 'text' && !media.length) throw new UploadPostError(400, 'Add a photo or video first.');
  if (kind === 'text' && !['x', 'th'].includes(k)) throw new UploadPostError(400, 'This platform needs a photo or video.');

  // Scheduled posts keep their media links valid until a few days after the post time.
  const when = typeof input.date === 'string' && typeof input.time === 'string' && input.time ? `${input.date}T${input.time}:00` : '';
  const timezone = typeof input.timezone === 'string' ? input.timezone : 'UTC';
  const future = when && new Date(when).getTime() > Date.now() + 2 * 60 * 1000;
  const days = future ? Math.min(30, Math.ceil((new Date(when).getTime() - Date.now()) / 86400000) + 3) : 3;
  const urls: string[] = [];
  for (const path of media) {
    const { data, error } = await admin.storage.from('post-media').createSignedUrl(path, days * 86400);
    if (error || !data) throw new UploadPostError(400, 'A photo or video is missing. Attach it again.');
    urls.push(data.signedUrl);
  }

  const form = new FormData();
  form.append('user', profileName(uid));
  form.append('platform[]', PLATFORM[k]);
  if (k === 'yt') { form.append('title', firstLine(caption).slice(0, 100) || 'New video'); form.append('description', caption); }
  else form.append('title', caption);
  if (typeof input.postId === 'string') form.append('external_id', input.postId.slice(0, 255));
  if (future) { form.append('scheduled_date', when); form.append('timezone', timezone); }
  else form.append('async_upload', 'true');

  let path = '/api/upload_text';
  if (kind === 'video') {
    path = '/api/upload';
    form.append('video', urls[0]);
    if (k === 'ig') form.append('media_type', 'REELS');
    if (k === 'tt' && input.tiktokDraft) form.append('post_mode', 'MEDIA_UPLOAD');
  } else if (kind === 'photos') {
    path = '/api/upload_photos';
    for (const u of urls) form.append('photos[]', u);
    if (k === 'ig') form.append('media_type', 'IMAGE');
  }

  const r = await up(path, { form });
  if (!r.ok) throw new UploadPostError(r.status, message(r.data, 'The post couldn’t be sent.'));
  if (r.data.job_id) return { state: 'scheduled', jobId: String(r.data.job_id) };
  if (r.data.request_id) return { state: 'processing', requestId: String(r.data.request_id) };
  const result = ((r.data.results as Json)?.[PLATFORM[k]] ?? {}) as Json;
  if (result.success === false) return { state: 'failed', error: String(result.error ?? 'The platform rejected the post.') };
  return { state: 'published', url: String(result.url ?? ''), postId: String(result.post_id ?? '') };
}

async function status(uid: string, input: Json) {
  const k = input.platform;
  if (!isKey(k)) throw new UploadPostError(400, 'Unknown platform.');
  const query: Record<string, string> = typeof input.jobId === 'string' && input.jobId ? { job_id: input.jobId } : { request_id: String(input.requestId ?? '') };
  const hist = await up('/api/uploadposts/history', { query: { ...query, profile_username: profileName(uid), limit: '10' } });
  const item = ((hist.data.history ?? []) as Json[]).find((h) => h.platform === PLATFORM[k]);
  if (item) {
    return item.success
      ? { state: 'published', url: String(item.post_url ?? ''), postId: String(item.platform_post_id ?? '') }
      : { state: 'failed', error: String(item.error_message ?? 'The platform rejected the post.') };
  }
  const st = await up('/api/uploadposts/status', { query });
  const s = String(st.data.status ?? '');
  if (s === 'failed') {
    const res = ((st.data.results ?? []) as Json[]).find((x) => x.platform === PLATFORM[k]);
    return { state: 'failed', error: String(res?.message ?? 'The post failed.') };
  }
  if (query.job_id) {
    const sch = await up(`/api/uploadposts/schedule/${encodeURIComponent(query.job_id)}`);
    if (sch.ok) return { state: 'scheduled' };
  }
  return { state: 'processing' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Use POST' }, 405);
  if (!KEY) return reply({ error: 'Posting isn’t switched on yet.' }, 503);

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: auth } = await admin.auth.getUser(token);
  const uid = auth.user?.id;
  if (!uid) return reply({ error: 'Sign in first.' }, 401);

  let input: Json;
  try { input = await req.json(); } catch { return reply({ error: 'Bad request' }, 400); }

  try {
    switch (input.action) {
      case 'connect': {
        await ensureProfile(uid);
        const r = await up('/api/uploadposts/users/generate-jwt', { json: {
          username: profileName(uid),
          redirect_url: `${SITE}#connected`,
          redirect_button_text: 'Back to Rollout Room',
          connect_title: 'Connect your accounts to Rollout Room',
          connect_description: 'Rollout Room only posts what you approve, and your content is never used to train AI.',
          platforms: Object.values(PLATFORM),
          show_calendar: false,
        } });
        if (!r.ok) throw new UploadPostError(r.status, message(r.data, 'Could not open the connect page.'));
        return reply({ url: r.data.access_url });
      }
      case 'accounts':
        return reply({ accounts: await accounts(uid) });
      case 'stats': {
        const keys = (Array.isArray(input.platforms) ? input.platforms : []).filter(isKey);
        if (!keys.length) return reply({ platforms: {} });
        return reply({ platforms: await stats(uid, keys) });
      }
      case 'publish':
        return reply(await publish(uid, input));
      case 'status':
        return reply(await status(uid, input));
      case 'cancel': {
        const job = String(input.jobId ?? '');
        if (!job) return reply({ error: 'Nothing to cancel.' }, 400);
        const r = await up(`/api/uploadposts/schedule/${encodeURIComponent(job)}`, { method: 'DELETE' });
        if (!r.ok && r.status !== 404) throw new UploadPostError(r.status, message(r.data, 'Could not cancel. It may already be posting.'));
        return reply({ ok: true });
      }
      case 'disconnect': {
        if (!isKey(input.platform)) return reply({ error: 'Unknown platform.' }, 400);
        const r = await up('/api/uploadposts/users/social', { method: 'DELETE', json: { profile_username: profileName(uid), social_platform: PLATFORM[input.platform] } });
        if (!r.ok) throw new UploadPostError(r.status, message(r.data, 'Could not disconnect.'));
        return reply({ ok: true });
      }
      default:
        return reply({ error: 'Unknown action.' }, 400);
    }
  } catch (e) {
    // Upload-Post's own auth errors mean our key is wrong, not that the creator is signed out.
    if (e instanceof UploadPostError) return reply({ error: e.message }, e.status === 401 || e.status === 403 || e.status < 400 || e.status >= 600 ? 502 : e.status);
    console.error(e);
    return reply({ error: 'Something went wrong.' }, 500);
  }
});
