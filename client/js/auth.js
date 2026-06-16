import { $, api, escapeHtml, toast } from './api.js';

async function loadStarterOptions() {
  const select = $('#race-select');
  if (!select) return;
  try {
    const data = await api('/api/auth/starter-options');
    select.innerHTML = Object.entries(data.races || {}).map(([id, race]) => `<option value="${id}" ${id === data.defaultRace ? 'selected' : ''}>${escapeHtml(race.label || id)} · ${escapeHtml(race.corp || '')}</option>`).join('');
  } catch (err) {
    select.innerHTML = '<option value="caldari">加达里合众国</option>';
    toast(err.message);
  }
}

$('#login-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  try { await api('/api/auth/login', { method: 'POST', body: Object.fromEntries(fd) }); location.href = '/command.html'; }
  catch (err) { toast(err.message); }
});

$('#register-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  try { await api('/api/auth/register', { method: 'POST', body: Object.fromEntries(fd) }); location.href = '/command.html'; }
  catch (err) { toast(err.message); }
});

$('[data-logout]')?.addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST', body: {} }); location.href = '/'; });

window.addEventListener('DOMContentLoaded', loadStarterOptions);
