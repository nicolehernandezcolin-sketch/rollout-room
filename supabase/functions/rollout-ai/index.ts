// Writes caption suggestions and posting plans for Rollout Room with Claude.
// The signed-in creator sends { prompt, tier, images }. The Anthropic key stays here on the server,
// each creator gets a daily cap, and nothing is stored: the prompt goes to Claude and the answer comes back.

import Anthropic from 'npm:@anthropic-ai/sdk@^0.135';
import { createClient } from 'npm:@supabase/supabase-js@^2';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const DAILY_LIMIT = Number(Deno.env.get('DAILY_AI_LIMIT') ?? '40');

// How hard Claude thinks for each kind of request. Plans get more effort than caption ideas.
const EFFORT = { quick: 'low', default: 'medium', complex: 'high' } as const;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// The page asks for JSON only; this pulls it out even if the answer is wrapped in a code fence.
function parseJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start < 0 || end <= start) throw new Error('no json');
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Use POST' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: auth } = await admin.auth.getUser(token);
  const user = auth.user;
  if (!user) return reply({ code: 'signed_out', error: 'Sign in to use suggestions.' }, 401);

  let input: { prompt?: unknown; tier?: unknown; images?: unknown };
  try {
    input = await req.json();
  } catch {
    return reply({ error: 'Bad request' }, 400);
  }
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  if (!prompt || prompt.length > 60000) return reply({ error: 'Bad request' }, 400);
  const tier = (input.tier === 'quick' || input.tier === 'complex') ? input.tier : 'default';
  const images = (Array.isArray(input.images) ? input.images : []).slice(0, 3).filter(
    (i): i is { media_type: (typeof IMAGE_TYPES)[number]; data: string } =>
      !!i && IMAGE_TYPES.includes(i.media_type) && typeof i.data === 'string' && i.data.length < 6_500_000,
  );

  const { data: allowed, error: usageError } = await admin.rpc('bump_ai_usage', { uid: user.id, max_per_day: DAILY_LIMIT });
  if (usageError) return reply({ error: 'Try again in a moment.' }, 500);
  if (!allowed) return reply({ code: 'daily_limit', error: 'Daily limit reached.' }, 429);

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...images.map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.media_type, data: i.data } })),
    { type: 'text', text: prompt },
  ];

  try {
    // Server-side fallback: if Claude Opus 5 declines, the API retries on a fallback model in the same call.
    const params = {
      model: 'claude-opus-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: EFFORT[tier] },
      system: 'You are the strategy and caption assistant inside Rollout Room, a tool that helps independent creators plan their social media. Respond with the JSON the request asks for and nothing else: no prose before or after it and no code fences.',
      messages: [{ role: 'user', content }],
    };
    const response = await anthropic.beta.messages.create(
      params as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming,
    );
    if (response.stop_reason === 'refusal') return reply({ code: 'refused', error: 'Claude declined this request.' }, 422);
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    try {
      return reply({ result: parseJson(text) });
    } catch {
      return reply({ code: 'invalid_json', error: 'The answer came back incomplete.' }, 502);
    }
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return reply({ code: 'rate_limited', error: 'Busy. Try again in a minute.' }, 429);
    if (error instanceof Anthropic.APIError) {
      console.error('Claude API error', error.status, error.message);
      return reply({ error: 'Claude is unavailable right now.' }, 502);
    }
    console.error(error);
    return reply({ error: 'Something went wrong.' }, 500);
  }
});
