(function () {
  'use strict';
  const factory = window.RecallCloudClient;
  const menu = document.querySelector('#settingsMenu');
  if (!factory?.enabled || !menu) return;
  const client = factory.create();
  const launcher = document.createElement('button');
  launcher.type = 'button'; launcher.className = 'settings-reset'; launcher.textContent = 'Admin AI providers'; launcher.hidden = true;
  menu.append(launcher);
  const dialog = document.createElement('dialog');
  dialog.className = 'account-dialog admin-ai-dialog'; dialog.setAttribute('aria-labelledby', 'adminAiTitle');
  dialog.innerHTML = '<header class="account-head"><h2 id="adminAiTitle">AI provider settings</h2><button type="button" class="text-button" id="adminAiClose">Close</button></header><p class="account-help">Applies to all users. Provider keys are managed only in Supabase Edge Function secrets and are never displayed here.</p><div id="adminAiContent"></div><p id="adminAiMessage" role="status" aria-live="polite"></p>';
  document.body.append(dialog);
  const content = dialog.querySelector('#adminAiContent');
  const message = dialog.querySelector('#adminAiMessage');
  let state = null, busy = false, generation = 0;
  const labels = { groq: 'Groq', nvidia: 'NVIDIA NIM', openai: 'OpenAI', gemini: 'Gemini' };
  function say(value) { message.textContent = value; }
  async function invoke(body) {
    const { data, error } = await client.functions.invoke('admin-ai', { body });
    if (error || !data || data.error) throw new Error(data?.error || 'Admin settings are unavailable.');
    return data;
  }
  function render() {
    content.replaceChildren();
    if (!state) return;
    const selection = document.createElement('section');
    const heading = document.createElement('h3'); heading.textContent = 'Provider for all users'; selection.append(heading);
    const providerSelect = document.createElement('select');
    for (const row of state.providers) {
      const option = document.createElement('option'); option.value = row.provider; option.textContent = labels[row.provider] || row.provider; providerSelect.append(option);
    }
    providerSelect.value = state.selected.provider;
    const modelSelect = document.createElement('select');
    const updateModels = () => {
      modelSelect.replaceChildren();
      const row = state.providers.find(item => item.provider === providerSelect.value);
      for (const model of row?.models || []) {
        const option = document.createElement('option'); option.value = model; option.textContent = model; modelSelect.append(option);
      }
      if (providerSelect.value === state.selected.provider) modelSelect.value = state.selected.model;
    };
    providerSelect.onchange = updateModels; updateModels();
    const save = document.createElement('button'); save.type = 'button'; save.className = 'primary-button'; save.textContent = 'Save selection';
    save.onclick = async () => {
      if (busy) return; busy = true; save.disabled = true; say('Saving…');
      try { state = await invoke({ action: 'select', provider: providerSelect.value, model: modelSelect.value }); render(); say('Provider selection saved.'); }
      catch { say('Could not save provider selection.'); }
      finally { busy = false; save.disabled = false; }
    };
    const providerLabel = document.createElement('label'); providerLabel.textContent = 'Provider'; providerLabel.append(providerSelect);
    const modelLabel = document.createElement('label'); modelLabel.textContent = 'Model'; modelLabel.append(modelSelect);
    selection.append(providerLabel, modelLabel, save); content.append(selection);
    for (const row of state.providers) {
      const section = document.createElement('section'); section.className = 'account-choice';
      const title = document.createElement('h3'); title.textContent = labels[row.provider] || row.provider;
      const detail = document.createElement('p');
      detail.textContent = `Key configured: ${row.key_configured ? 'yes' : 'no'} · Selected model: ${state.selected.provider === row.provider ? state.selected.model : 'not selected'} · Status: ${row.status === 'working' ? 'working' : row.status === 'failed' ? 'failed' : 'not tested'} · Last successful test: ${row.last_successful_test_at ? new Date(row.last_successful_test_at).toLocaleString() : 'never'}`;
      const test = document.createElement('button'); test.type = 'button'; test.className = 'text-button'; test.textContent = 'Test connection'; test.setAttribute('aria-label', `Test ${title.textContent} connection`); test.disabled = !row.key_configured;
      test.onclick = async () => {
        if (busy) return; busy = true; test.disabled = true; say(`Testing ${title.textContent}…`);
        try {
          const checked = await invoke({ action: 'test', provider: row.provider, model: row.provider === state.selected.provider ? state.selected.model : row.models[0] });
          if (checked.working === false) say(`${title.textContent}: failed — ${checked.error || 'Provider unavailable.'}`);
          else { state = checked; render(); say(`${title.textContent}: working.`); }
          if (checked.working === false) { state = await invoke({ action: 'status' }); render(); }
        } catch { say(`${title.textContent}: test unavailable.`); }
        finally { busy = false; test.disabled = false; }
      };
      section.append(title, detail, test); content.append(section);
    }
  }
  async function refreshAccess() {
    const current = ++generation;
    launcher.hidden = true; state = null;
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session?.user) return;
      const { data, error } = await client.from('recall_ai_admins').select('user_id').eq('user_id', session.user.id).limit(1);
      if (current !== generation || error || !data?.length) return;
      state = await invoke({ action: 'status' });
      if (current === generation) { launcher.hidden = false; render(); }
    } catch { /* No admin UI when offline or unauthorized. */ }
  }
  launcher.onclick = () => { if (!state) return; render(); dialog.showModal(); };
  dialog.querySelector('#adminAiClose').onclick = () => dialog.close();
  document.addEventListener('keydown', event => { if (dialog.open) event.stopPropagation(); }, true);
  client.auth.onAuthStateChange(() => { setTimeout(refreshAccess, 0); });
  refreshAccess();
})();
