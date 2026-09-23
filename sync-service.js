(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sync-core'));
  else root.RecallSyncService = factory(root.RecallSyncCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';
  class SyncError extends Error {
    constructor(code, message) { super(message); this.name = 'SyncError'; this.code = code; }
  }
  function friendlyError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    if (error instanceof SyncError || message.startsWith('Invalid library:')) return message;
    if (code === 'invalid_credentials') return 'Email or password is incorrect.';
    if (code === 'email_not_confirmed') return 'Confirm your email before signing in. The project may require email confirmation.';
    if (code === 'user_already_exists') return 'An account with this email already exists. Try signing in.';
    if (code === 'signup_disabled') return 'New accounts are disabled for this project.';
    if (code === 'weak_password' || code === 'validation_failed') return 'Check your email and password. Your password must meet the project’s password requirements.';
    if (code === 'email_address_not_authorized' || /not authorized|email rate limit/i.test(message)) return 'Supabase could not send a confirmation email. Its default email service is limited to project-team addresses. See the setup guide.';
    if (error?.status === 429 || code.includes('rate_limit')) return 'Too many requests. Wait a little and try again.';
    if (code === 'PGRST205' || code === '42P01') return 'Cloud backup is not set up yet. Run the supplied Supabase SQL.';
    if (code === '42501') return 'Cloud access was denied. Check the supplied row security policies and sign in again.';
    if (error?.status === 401 || code.includes('refresh_token') || code === 'session_not_found') return 'Your session has expired. Sign in again; your local library is safe.';
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError' || /fetch|network|offline|timeout|aborted/i.test(message)) return 'Cloud is unreachable. Check your connection or whether the free Supabase project is paused. Your local library is available.';
    return 'The cloud request failed. Your local library is safe. Check the account details and Supabase setup, then retry.';
  }
  function createService({ client, local, storage, namespace, now = () => new Date().toISOString(), onChange = () => {} }) {
    let session = null, epoch = 0, busy = false, subscription, disposed = false;
    const issuedPlans = new WeakSet();
    const state = { session: null, busy: false, status: 'Restoring account…', error: '', lastSync: null, warning: '' };
    const emit = () => { if (!disposed) onChange({ ...state }); };
    const metaKey = userId => 'recall-cloud-sync-v1:' + namespace + ':' + userId;
    function metadata(userId) {
      try {
        const data = JSON.parse(storage.getItem(metaKey(userId)));
        if (!data || !Number.isSafeInteger(data.revision) || !data.updated_at) return null;
        Core.validateLibrary(data.base);
        return data;
      } catch { return null; }
    }
    function setSession(next) {
      if (session?.user?.id !== next?.user?.id) epoch += 1;
      session = next || null; state.session = session;
      state.lastSync = session ? metadata(session.user.id)?.lastSync || null : null;
      if (!busy) state.status = session ? 'Ready — sync runs only when you choose it.' : 'Signed out — library is stored on this device.';
      emit();
    }
    function guard(context) {
      if (!session || session.user.id !== context.userId || epoch !== context.epoch) throw new SyncError('account_changed', 'The account changed. Start the sync again. No local data was replaced.');
    }
    function context() {
      if (!session) throw new SyncError('signed_out', 'Sign in to use cloud backup.');
      return { userId: session.user.id, epoch };
    }
    function readLocal() {
      try { return Core.validateLibrary(local.read()); }
      catch (error) { throw new SyncError('local_storage', error.message); }
    }
    async function task(label, run) {
      if (busy) throw new SyncError('busy', 'Wait for the current account or sync request to finish.');
      busy = state.busy = true; state.status = label; state.error = ''; state.warning = ''; emit();
      try { return await run(); }
      catch (error) { state.error = friendlyError(error); state.status = 'Request failed'; throw error; }
      finally { busy = state.busy = false; emit(); }
    }
    async function fetchRow(ctx) {
      guard(ctx);
      const { data, error } = await client.from('recall_libraries').select('user_id,library,updated_at,revision').eq('user_id', ctx.userId).maybeSingle();
      guard(ctx);
      if (error) throw error;
      return Core.validateRow(data, ctx.userId);
    }
    function record(ctx, row) {
      guard(ctx);
      const meta = { revision: row.revision, updated_at: row.updated_at, base: row.library, lastSync: now() };
      state.lastSync = meta.lastSync;
      try { storage.setItem(metaKey(ctx.userId), JSON.stringify(meta)); }
      catch { state.warning = 'Sync completed, but this browser could not save its sync history. Safe merge may be unavailable next time.'; }
    }
    async function writeRow(ctx, library, previous) {
      guard(ctx); Core.validateLibrary(library);
      const table = client.from('recall_libraries');
      const query = previous ? table.update({ library }).eq('user_id', ctx.userId).eq('revision', previous.revision).eq('updated_at', previous.updated_at) : table.insert({ user_id: ctx.userId, library });
      const { data, error } = await query.select('user_id,library,updated_at,revision').maybeSingle();
      guard(ctx);
      if (error?.code === '23505' || (!error && !data)) throw new SyncError('conflict', 'The cloud backup changed on another device. Nothing was overwritten. Check the cloud again.');
      if (error) throw error;
      return Core.validateRow(data, ctx.userId);
    }
    async function start() {
      subscription = client.auth.onAuthStateChange((_event, next) => { setSession(next); }).data.subscription;
      return task('Restoring account…', async () => {
        const startedEpoch = epoch;
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        if (epoch === startedEpoch) setSession(data.session);
        state.status = session ? 'Ready — sync runs only when you choose it.' : 'Signed out — library is stored on this device.';
      });
    }
    function authenticate(mode, email, password) {
      return task(mode === 'signup' ? 'Creating account…' : 'Signing in…', async () => {
        if (!['signup', 'signin'].includes(mode)) throw new SyncError('invalid_auth', 'Choose sign in or sign up.');
        if (!email?.trim() || !password) throw new SyncError('invalid_auth', 'Enter your email and password.');
        const { data, error } = await client.auth[mode === 'signup' ? 'signUp' : 'signInWithPassword']({ email: email.trim(), password });
        if (error) throw error;
        setSession(data.session);
        state.status = data.session ? 'Signed in. Choose upload or download to sync.' : 'Check your email to confirm your account, then sign in. If you already have an account, try signing in.';
      });
    }
    function signOut() {
      return task('Signing out…', async () => {
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (error && session) throw error;
        if (error) state.warning = 'Signed out on this device. The server could not confirm session revocation; it may be offline.';
        setSession(null); state.status = 'Signed out. Your local library is still available.';
      });
    }
    function prepare(direction) {
      return task('Checking cloud backup…', async () => {
        if (!['upload', 'download'].includes(direction)) throw new SyncError('invalid_action', 'Choose upload or download.');
        const ctx = context();
        const localLibrary = readLocal();
        const cloud = await fetchRow(ctx);
        if (!cloud && direction === 'download') throw new SyncError('no_backup', 'This account has no cloud backup yet. Upload your local library first.');
        if (cloud && Core.equal(localLibrary, cloud.library)) {
          record(ctx, cloud); state.status = 'Local and cloud libraries match.'; return { identical: true };
        }
        const meta = metadata(ctx.userId);
        const plan = { ...ctx, direction, local: localLibrary, cloud, conflict: Boolean(meta && !Core.sameVersion(meta, cloud)), merge: cloud ? Core.mergeLibraries(localLibrary, cloud.library, meta?.base || null) : { safe: false, conflicts: [] } };
        // Freeze the preview so callers cannot change the data after it was reviewed.
        const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
        freeze(plan); issuedPlans.add(plan);
        state.status = plan.conflict ? 'Cloud changed since your last sync. Choose which data to keep.' : 'Review the local and cloud copies before continuing.';
        return plan;
      });
    }
    function resolve(plan, choice) {
      return task('Applying your sync choice…', async () => {
        if (!issuedPlans.has(plan)) throw new SyncError('stale_plan', 'Check the cloud again before syncing.');
        issuedPlans.delete(plan);
        guard(plan);
        if (choice === 'cancel' || choice === 'local' && plan.direction === 'download') {
          state.status = choice === 'cancel' ? 'Sync cancelled.' : 'Kept this device’s library. Cloud was not changed.';
          return { localChanged: false };
        }
        if (!['local', 'cloud', 'merge'].includes(choice) || choice === 'cloud' && !plan.cloud || choice === 'merge' && !plan.merge.safe) throw new SyncError('unsafe_merge', 'These libraries cannot be merged safely. Choose a copy or cancel.');
        if (!Core.equal(readLocal(), plan.local)) throw new SyncError('local_changed', 'Your local library changed while this dialog was open. Check the cloud again.');
        const target = choice === 'local' ? plan.local : choice === 'cloud' ? plan.cloud.library : plan.merge.library;
        const writeCloud = choice === 'local' || choice === 'merge' && plan.direction === 'upload';
        let row;
        if (writeCloud) {
          row = await writeRow(plan, target, plan.cloud);
          record(plan, row);
          if (choice === 'local' && !Core.equal(readLocal(), plan.local)) {
            state.status = 'The reviewed snapshot was uploaded. Newer local changes still need uploading.';
            return { localChanged: false };
          }
        } else {
          row = await fetchRow(plan);
          if (!Core.sameVersion(row, plan.cloud)) throw new SyncError('conflict', 'The cloud backup changed while you were choosing. Check it again before downloading.');
        }
        guard(plan);
        const localChanged = choice !== 'local' && !Core.equal(target, plan.local);
        if (localChanged) {
          try { local.replace(Core.clone(target), plan.local); }
          catch (error) {
            if (writeCloud) throw new SyncError('partial_sync', 'Cloud saved the reviewed snapshot, but this device could not replace its local library: ' + error.message);
            throw new SyncError('local_storage', error.message);
          }
        }
        if (!writeCloud) record(plan, row);
        state.status = choice === 'merge' && plan.direction === 'download' ? 'Merged on this device. Upload when you want to update the cloud.' : writeCloud ? 'Local library uploaded.' : 'Cloud library downloaded. Your previous library was saved for recovery.';
        return { localChanged };
      });
    }
    return { start, authenticate, signOut, prepare, resolve, getState: () => ({ ...state }), localChanged() { if (!busy) { state.status = 'Local changes saved. Upload when you are ready.'; emit(); } }, dispose() { disposed = true; subscription?.unsubscribe(); } };
  }
  return { SyncError, friendlyError, createService };
});
