import { $, api, toast } from './api.js';

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
