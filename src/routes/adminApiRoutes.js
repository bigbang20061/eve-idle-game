import express from 'express';
import { requireAuth, requireAdmin, asyncHandler } from '../middleware/auth.js';
import { importSdeDirectory } from '../services/sdeImporter.js';
import { seedDefaultSde } from '../services/catalog.js';
import { SdeType, SdeSystem, SdeBlueprint, SdeGroup, SdeCategory, SdeMarketGroup, User, Character } from '../models/index.js';
import { t } from '../services/i18n.js';

export const adminApiRoutes = express.Router();
adminApiRoutes.use(requireAuth, requireAdmin);

adminApiRoutes.get('/sde/counts', asyncHandler(async (req, res) => {
  res.json({ ok: true, counts: await getCounts() });
}));

adminApiRoutes.post('/sde/import', asyncHandler(async (req, res) => {
  const dir = String(req.body.dir || '').trim();
  const limit = Math.max(0, Number(req.body.limit || 0));
  if (!dir) throw new Error(t('error.admin_import_dir'));
  const result = await importSdeDirectory(dir, { limit });
  res.json({ ok: true, counts: await getCounts(), result });
}));

adminApiRoutes.post('/sde/seed-reset', asyncHandler(async (req, res) => {
  const result = await seedDefaultSde({ reset: true });
  res.json({ ok: true, counts: await getCounts(), result });
}));

adminApiRoutes.get('/ops', asyncHandler(async (req, res) => {
  const [users, characters] = await Promise.all([User.countDocuments(), Character.countDocuments()]);
  res.json({ ok: true, users, characters });
}));

adminApiRoutes.use((err, req, res, next) => {
  console.error('[admin-api]', err);
  res.status(err.status || 400).json({ ok: false, error: err.message || t('error.operation_failed') });
});

async function getCounts() {
  const [types, systems, blueprints, groups, categories, marketGroups] = await Promise.all([
    SdeType.estimatedDocumentCount(), SdeSystem.estimatedDocumentCount(), SdeBlueprint.estimatedDocumentCount(),
    SdeGroup.estimatedDocumentCount(), SdeCategory.estimatedDocumentCount(), SdeMarketGroup.estimatedDocumentCount()
  ]);
  return { types, systems, blueprints, groups, categories, marketGroups };
}
