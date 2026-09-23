import { createClient } from '@supabase/supabase-js';
import Core from './sync-core.js';

// These two public values are substituted by scripts/build.js. Nothing else in
// process.env is embedded in the browser or Electron renderer.
const config = Core.validateConfig(__RECALL_SUPABASE_URL__, __RECALL_SUPABASE_KEY__);
window.RecallCloudClient = {
  enabled: config.enabled,
  namespace: config.url,
  create() {
    if (!config.enabled) return null;
    return createClient(config.url, config.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: window.localStorage,
        storageKey: 'recall-account-' + new URL(config.url).hostname,
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
  },
};
