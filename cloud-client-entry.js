import { createClient } from '@supabase/supabase-js';
import Core from './sync-core.js';

// These two public values are substituted by scripts/build.js. Nothing else in
// process.env is embedded in the browser or Electron renderer.
const config = Core.validateConfig(__RECALL_SUPABASE_URL__, __RECALL_SUPABASE_KEY__);
let sharedClient;
const storageKey = config.enabled ? 'recall-account-' + new URL(config.url).hostname : '';
// Older builds persisted refresh tokens beyond the browser session. Remove only
// this app's old key; existing users will need to sign in once more.
if (storageKey) window.localStorage.removeItem(storageKey);
window.RecallCloudClient = {
  enabled: config.enabled,
  namespace: config.url,
  create() {
    if (!config.enabled) return null;
    sharedClient ||= createClient(config.url, config.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: window.sessionStorage,
        storageKey,
      },
      global: {
        async fetch(input, options = {}) {
          const controller = new AbortController();
          const abort = () => controller.abort();
          if (options.signal?.aborted) abort();
          options.signal?.addEventListener('abort', abort, { once: true });
          const timeout = setTimeout(abort, 15000);
          try { return await fetch(input, { ...options, signal: controller.signal }); }
          finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); }
        },
      },
    });
    return sharedClient;
  },
};
