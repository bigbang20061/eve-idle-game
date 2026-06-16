import express from 'express';
import { requireAuth, asyncHandler } from '../middleware/auth.js';
import { getStaticSdeStore } from '../services/staticSdeStore.js';
import { safeText } from '../services/formulas.js';

export const staticSdeRoutes = express.Router();
staticSdeRoutes.use(requireAuth);

function limitValue(raw, fallback = 100) {
  return Math.max(1, Math.min(500, Number(raw || fallback)));
}

staticSdeRoutes.get('/status', asyncHandler(async (req, res) => {
  const store = getStaticSdeStore();
  const loadCore = ['1', 'true', true].includes(req.query.loadCore);
  res.json({ ok: true, ...(await store.status({ loadCore })) });
}));

staticSdeRoutes.get('/search', asyncHandler(async (req, res) => {
  const store = getStaticSdeStore();
  const collection = safeText(req.query.collection || 'types', 60);
  const q = safeText(req.query.q || '', 120);
  const kind = safeText(req.query.kind || '', 60);
  const limit = limitValue(req.query.limit, 100);
  const result = await store.search({ collection, q, kind, limit });
  res.json({ ok: true, source: 'static-sde', collection, q, kind, limit, ...result });
}));

staticSdeRoutes.get('/types/:typeId', asyncHandler(async (req, res) => {
  const store = getStaticSdeStore();
  const type = await store.getType(req.params.typeId);
  if (!type) return res.status(404).json({ ok: false, error: 'type not found in static SDE' });
  const dogma = await store.getTypeDogma(req.params.typeId);
  res.json({ ok: true, source: 'static-sde', type, dogma });
}));

staticSdeRoutes.get('/races', asyncHandler(async (req, res) => {
  const store = getStaticSdeStore();
  res.json({ ok: true, source: 'static-sde', races: await store.listRaces() });
}));

staticSdeRoutes.get('/dogma-attributes', asyncHandler(async (req, res) => {
  const store = getStaticSdeStore();
  const q = safeText(req.query.q || '', 120);
  const limit = limitValue(req.query.limit, 100);
  res.json({ ok: true, source: 'static-sde', dogmaAttributes: await store.searchDogmaAttributes({ q, limit }) });
}));
