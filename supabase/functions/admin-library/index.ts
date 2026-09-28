// @ts-nocheck
import '../_shared/catalog-core.js';
import bundled from '../_shared/catalog-bundled.json' with { type: 'json' };
const Core = globalThis.RecallCatalogCore;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (status, body) => Response.json(body, { status, headers: cors });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function publicApiKey(value) {
  if (!value || value.length > 2048) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  try { return JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; }
  catch { return false; }
}
async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing request.');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > Core.MAX_PUBLICATION_BYTES) { await reader.cancel(); throw new Error('Publication exceeds the 2 MiB limit.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const keys = Object.keys(body || {}).sort().join(',');
  if (body?.action === 'status' && keys === 'action') return body;
  if (body?.action !== 'publish' || keys !== 'action,deck,idempotencyKey,metadata' || !uuid.test(body.idempotencyKey || '')) throw new Error('Invalid publication request.');
  return body;
}
const hash = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), value => value.toString(16).padStart(2, '0')).join('');
const similarTitle = (a, b) => a === b || (Math.min(a.length, b.length) >= 12 && Math.min(a.length, b.length) / Math.max(a.length, b.length) >= 0.8 && (a.includes(b) || b.includes(a)));

export async function handleRequest(request, { fetcher = fetch, env = name => Deno.env.get(name) } = {}) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json(415, { error: 'JSON required.' });
  let body;
  try { body = await readBody(request); } catch { return json(400, { error: 'Invalid or oversized publication request.' }); }
  const token = request.headers.get('authorization')?.match(/^Bearer ([-\w.]+)$/)?.[1];
  const apiKey = request.headers.get('apikey') || '';
  if (!token || !publicApiKey(apiKey) || token === apiKey) return json(401, { error: 'Sign in to publish a deck.' });
  const projectUrl = String(env('SUPABASE_URL') || '').replace(/\/$/, '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(projectUrl)) return json(503, { error: 'Web library publishing is unavailable.' });
  const headers = { apikey: apiKey, authorization: `Bearer ${token}` };
  let user;
  try {
    const auth = await fetcher(`${projectUrl}/auth/v1/user`, { headers, signal: AbortSignal.timeout(5000) });
    if (!auth.ok) return json(401, { error: 'Session expired. Sign in again.' });
    user = await auth.json();
    if (!uuid.test(user?.id || '')) return json(401, { error: 'Sign in to publish a deck.' });
    const member = await fetcher(`${projectUrl}/rest/v1/recall_ai_admins?select=user_id&user_id=eq.${user.id}`, { headers, signal: AbortSignal.timeout(5000) });
    if (!member.ok) throw new Error('Membership unavailable');
    if (!(await member.json())?.some(row => row.user_id === user.id)) return json(403, { error: 'Admin access required.' });
  } catch { return json(503, { error: 'Web library publishing is unavailable.' }); }
  if (body.action === 'status') return json(200, { authorized: true });
  let clean;
  try { clean = Core.preparePublication(body.metadata, body.deck); }
  catch (error) { return json(400, { error: error.message }); }
  const titleKey = Core.normalizeText(clean.metadata.title).replace(/\s/g, '');
  const contentHash = await hash(Core.contentKey(clean.deck));
  if (bundled.some(row => similarTitle(row.title, titleKey) || row.contentHash === contentHash)) return json(409, { error: 'A likely duplicate title or matching deck already exists in the bundled library.' });
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return json(503, { error: 'Web library publishing is unavailable.' });
  try {
    const response = await fetcher(`${projectUrl}/rest/v1/rpc/recall_publish_catalog`, {
      method: 'POST', headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_publisher: user.id, p_key: body.idempotencyKey, p_request_hash: await hash(JSON.stringify(clean)),
        p_title: titleKey, p_content_hash: contentHash, p_snapshot: Core.publicationEntry(clean) }), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      if (detail.code === '42501') return json(403, { error: 'Admin access required.' });
      if (detail.code === '23505' || detail.code === 'P0001') return json(409, { error: 'A likely duplicate title or matching deck already exists, or this retry key was used for different content. Nothing was replaced.' });
      if (detail.code === '23514') return json(400, { error: 'The publication failed database validation.' });
      throw new Error('Database unavailable');
    }
    const result = await response.json();
    if (!/^web-[a-f0-9]{32}$/.test(result?.id) || typeof result.replayed !== 'boolean') throw new Error('Invalid response');
    return json(200, { id: result.id, replayed: result.replayed, title: clean.metadata.title, cardCount: clean.deck.cards.length, version: clean.metadata.version });
  } catch { return json(503, { error: 'Publication could not be confirmed. Retry this same confirmation safely; do not start another publication.' }); }
}
if (typeof Deno !== 'undefined') Deno.serve(handleRequest);
