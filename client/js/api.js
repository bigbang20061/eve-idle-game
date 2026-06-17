export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const cn = new Intl.NumberFormat('zh-CN');
export const isk = n => `${cn.format(Math.round(Number(n || 0)))} ISK`;
export const escapeHtml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function cargoVolume(stacks = []) { return stacks.reduce((sum, s) => sum + Number(s.quantity || 0) * Number(s.volume || 0), 0); }
// Client-side i18n: strings come from the server catalog, never hardcoded in views.
let I18N = {};
export async function loadI18n() { try { const d = await api('/api/i18n'); I18N = d.messages || {}; } catch { I18N = {}; } return I18N; }
export function t(key, vars = {}) { const tpl = I18N[key]; const s = tpl === undefined ? key : tpl; return String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`)); }
export function tLabel(category, id) { return t(`${category}.${id}`); }
export async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, credentials: 'same-origin', ...options, body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
export function toast(text, type = 'info') {
  let box = $('#toast-box');
  if (!box) { box = document.createElement('div'); box.id = 'toast-box'; box.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:1000;display:grid;gap:8px;max-width:360px'; document.body.appendChild(box); }
  const el = document.createElement('div'); el.className = 'alert'; el.textContent = text; box.appendChild(el); setTimeout(() => el.remove(), 4200);
}
export async function requireSession() {
  const me = await api('/api/auth/me');
  if (!me.user && !['/login','/register','/'].includes(location.pathname)) location.href = '/login.html';
  return me;
}
