// Deletes the signed-in creator's account: their social connections at Upload-Post, any media waiting to
// post, then the account itself. Workspace, keys, media kit and usage rows cascade from auth.users.

import { createClient } from 'npm:@supabase/supabase-js@^2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Use POST' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) return reply({ error: 'Sign in first.' }, 401);

  const uid = auth.user.id;
  // Their Upload-Post profile (and with it the social connections) and any media still waiting to post.
  const key = Deno.env.get('UPLOAD_POST_API_KEY');
  if (key) {
    await fetch('https://api.upload-post.com/api/uploadposts/users', {
      method: 'DELETE', headers: { Authorization: `Apikey ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `rr-${uid}` }),
    }).catch(() => {});
  }
  const bucket = admin.storage.from('post-media');
  const { data: folders } = await bucket.list(uid, { limit: 1000 });
  for (const f of folders ?? []) {
    const { data: files } = await bucket.list(`${uid}/${f.name}`, { limit: 1000 });
    if (files?.length) await bucket.remove(files.map((x) => `${uid}/${f.name}/${x.name}`));
  }

  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) return reply({ error: 'Could not delete the account.' }, 500);
  return reply({ ok: true });
});
