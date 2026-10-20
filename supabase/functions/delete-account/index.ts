// Deletes the signed-in creator's account. Their workspace, keys, media kit and usage rows go with it
// (every table cascades from auth.users).

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

  const { error } = await admin.auth.admin.deleteUser(auth.user.id);
  if (error) return reply({ error: 'Could not delete the account.' }, 500);
  return reply({ ok: true });
});
