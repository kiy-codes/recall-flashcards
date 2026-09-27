// @ts-nocheck
import { validateInput } from '../_shared/evaluator.ts';
import { callProvider, DEFAULT_SELECTION, validSelection } from '../_shared/providers.ts';
// Per-isolate throttle only; a shared durable counter would need extra storage.
const quotas = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const PER_USER_LIMIT = 10;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const json = (status, body) => Response.json(body, { status, headers: cors });

async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const parts = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 16384) throw new Error('Body too large');
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return validateInput(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}

function publicApiKey(value) {
  if (!value || value.length > 2048) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return false;
  try { return JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; }
  catch { return false; }
}

function takeQuota(userId, now, state) {
  if (state.size > 5000) for (const [id, entry] of state) if (now - entry.start >= WINDOW_MS) state.delete(id);
  let entry = state.get(userId);
  if (!entry || now - entry.start >= WINDOW_MS) { entry = { start: now, count: 0 }; state.set(userId, entry); }
  if (entry.count >= PER_USER_LIMIT) return false;
  entry.count += 1;
  return true;
}

export async function handleRequest(request, { fetcher = fetch, env = name => Deno.env.get(name), now = () => Date.now(), rateState = quotas } = {}) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json(415, { error: 'JSON required.' });

  let input;
  try { input = await readBody(request); }
  catch { return json(400, { error: 'Invalid or private-looking evaluation text.' }); }

  const token = request.headers.get('authorization')?.match(/^Bearer ([-\w.]+)$/)?.[1];
  const apiKey = request.headers.get('apikey') || '';
  if (!token || !publicApiKey(apiKey) || token === apiKey) return json(401, { error: 'Sign in to use AI evaluation.' });
  const projectUrl = String(env('SUPABASE_URL') || '').replace(/\/$/, '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(projectUrl)) return json(503, { error: 'AI evaluation is not configured.' });

  let user;
  try {
    const response = await fetcher(`${projectUrl}/auth/v1/user`, {
      headers: { apikey: apiKey, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return json(401, { error: 'Session expired. Sign in again.' });
    user = await response.json();
  } catch { return json(503, { error: 'Authentication is temporarily unavailable.' }); }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user?.id || '')) return json(401, { error: 'Sign in to use AI evaluation.' });

  // Service-role credential is supplied by Supabase to this function only.
  // It is never sent to the renderer or returned in a response.
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return json(503, { error: 'AI evaluation is not configured.' });
  let selection;
  try {
    const settings = await fetcher(`${projectUrl}/rest/v1/recall_ai_settings?select=provider,model&id=eq.true`, {
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` }, signal: AbortSignal.timeout(2500),
    });
    if (!settings.ok) return json(503, { error: 'AI evaluation is not configured.' });
    const rows = await settings.json();
    selection = rows?.[0] || { ...DEFAULT_SELECTION, model: env('GROQ_MODEL') || DEFAULT_SELECTION.model };
    if (!validSelection(selection)) return json(503, { error: 'AI provider configuration is invalid.' });
  } catch { return json(503, { error: 'AI evaluation is unavailable.' }); }
  if (!takeQuota(user.id, now(), rateState)) return json(429, { error: 'AI evaluation limit reached. Try later.' });
  const answer = await callProvider(selection, input, { fetcher, env });
  if (answer.error) return json(answer.status, { error: answer.status === 429 ? 'AI is busy. Evaluated locally.' : 'AI evaluation is unavailable. Evaluated locally.' });
  return json(200, answer.result);
}

if (typeof Deno !== 'undefined') Deno.serve(handleRequest);
