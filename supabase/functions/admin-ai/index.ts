// @ts-nocheck
import { MODELS, configured, validSelection, callProvider } from '../_shared/providers.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (status, body) => Response.json(body, { status, headers: cors });
const quotas = new Map();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function publicApiKey(value) {
  if (!value || value.length > 2048) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  try { return JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; }
  catch { return false; }
}
function takeQuota(id, action, now, state) {
  const key = `${id}:${action}`;
  if (state.size > 5000) for (const [entryKey, value] of state) if (now - value.start >= 3600000) state.delete(entryKey);
  let value = state.get(key);
  if (!value || now - value.start >= 3600000) { value = { start: now, count: 0 }; state.set(key, value); }
  if (value.count >= (action === 'test' ? 12 : action === 'select' ? 20 : 120)) return false;
  value.count += 1;
  return true;
}
async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing request');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 1024) throw new Error('Large request');
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!body || typeof body !== 'object' || Array.isArray(body) || !['status', 'select', 'test'].includes(body.action)) throw new Error('Invalid action');
  const keys = Object.keys(body).sort().join(',');
  if (body.action === 'status' ? keys !== 'action' : keys !== 'action,model,provider') throw new Error('Invalid fields');
  if (body.action !== 'status' && !validSelection(body)) throw new Error('Invalid selection');
  return body;
}

export async function handleRequest(request, { fetcher = fetch, env = name => Deno.env.get(name), now = () => Date.now(), rateState = quotas } = {}) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json(415, { error: 'JSON required.' });
  let body;
  try { body = await readBody(request); } catch { return json(400, { error: 'Invalid admin request.' }); }
  const token = request.headers.get('authorization')?.match(/^Bearer ([-\w.]+)$/)?.[1];
  const apiKey = request.headers.get('apikey') || '';
  if (!token || !publicApiKey(apiKey) || token === apiKey) return json(401, { error: 'Sign in to manage AI settings.' });
  const projectUrl = String(env('SUPABASE_URL') || '').replace(/\/$/, '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(projectUrl)) return json(503, { error: 'Admin settings are unavailable.' });
  const headers = { apikey: apiKey, authorization: `Bearer ${token}` };
  let user;
  try {
    const auth = await fetcher(`${projectUrl}/auth/v1/user`, { headers, signal: AbortSignal.timeout(2500) });
    if (!auth.ok) return json(401, { error: 'Session expired. Sign in again.' });
    user = await auth.json();
    if (!uuid.test(user?.id || '')) return json(401, { error: 'Sign in to manage AI settings.' });
    // This SELECT is checked by recall_ai_admins RLS. No client can INSERT a role.
    const member = await fetcher(`${projectUrl}/rest/v1/recall_ai_admins?select=user_id&user_id=eq.${user.id}`, { headers, signal: AbortSignal.timeout(2500) });
    if (!member.ok || !(await member.json())?.some(row => row.user_id === user.id)) return json(403, { error: 'Admin access required.' });
  } catch { return json(503, { error: 'Admin settings are unavailable.' }); }
  if (!takeQuota(user.id, body.action, now(), rateState)) return json(429, { error: 'Admin request limit reached. Try later.' });
  const base = `${projectUrl}/rest/v1`;
  const readRows = async path => {
    const response = await fetcher(`${base}/${path}`, { headers, signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error('Database unavailable');
    return response.json();
  };
  const patch = async (path, value, serverOnly = false) => {
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
    if (serverOnly && !serviceKey) throw new Error('Database unavailable');
    const writeHeaders = serverOnly ? { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } : headers;
    const response = await fetcher(`${base}/${path}`, { method: 'PATCH', headers: { ...writeHeaders, 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify(value), signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error('Database unavailable');
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error('No authorized row');
  };
  try {
    if (body.action === 'select') await patch('recall_ai_settings?id=eq.true&select=provider,model', { provider: body.provider, model: body.model });
    if (body.action === 'test') {
      const checked = await callProvider(body, null, { fetcher, env, testMode: true });
      const timestamp = new Date(now()).toISOString();
      await patch(`recall_ai_provider_tests?provider=eq.${body.provider}&select=provider`, {
        status: checked.working ? 'working' : 'failed', last_tested_at: timestamp,
        ...(checked.working ? { last_successful_test_at: timestamp } : {}),
      }, true);
      // Never return the provider's response body or credential-bearing error.
      if (!checked.working) return json(200, { provider: body.provider, working: false, error: checked.error });
    }
    const [settings, tests] = await Promise.all([
      readRows('recall_ai_settings?select=provider,model&id=eq.true'),
      readRows('recall_ai_provider_tests?select=provider,status,last_successful_test_at'),
    ]);
    if (!validSelection(settings?.[0])) throw new Error('Invalid selection');
    return json(200, {
      selected: { provider: settings[0].provider, model: settings[0].model },
      providers: Object.entries(MODELS).map(([provider, models]) => ({ provider, models, key_configured: configured(provider, env), status: tests.find(row => row.provider === provider)?.status || 'not_tested', last_successful_test_at: tests.find(row => row.provider === provider)?.last_successful_test_at || null })),
    });
  } catch { return json(503, { error: 'Admin settings are unavailable.' }); }
}

if (typeof Deno !== 'undefined') Deno.serve(handleRequest);
