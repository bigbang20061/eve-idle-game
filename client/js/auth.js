import { $, api, toast, escapeHtml } from './api.js';

async function loadStarterOptions() {
  const select = $('#race-select');
  if (!select) return;
  try {
    const data = await api('/api/auth/starter-options');
    const races = data.races || {};
    select.innerHTML = Object.entries(races).map(([id, race]) => `<option value="${id}">${escapeHtml(race.label || id)}</option>`).join('');
    const render = () => {
      const race = races[select.value];
      const box = $('#race-description');
      if (box && race) box.textContent = race.description || '';
    };
    select.addEventListener('change', render);
    render();
  } catch (err) { toast(err.message); }
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

loadStarterOptions();
