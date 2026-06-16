import express from 'express';
import { requireAuth, requireAdmin, asyncHandler } from '../middleware/auth.js';
import { importSdeDirectory } from '../services/sdeImporter.js';
import { seedDefaultSde } from '../services/catalog.js';
import { SdeType, SdeSystem, SdeBlueprint, SdeGroup, SdeCategory, SdeMarketGroup, User, Character } from '../models/index.js';

export const adminRoutes = express.Router();
adminRoutes.use(requireAuth, requireAdmin);

adminRoutes.get('/sde', asyncHandler(async (req, res) => {
  const counts = await getCounts();
  res.render('admin/sde', { title: '管理员 SDE 导入', active: 'sde', counts, result: null, error: '' });
}));

adminRoutes.post('/sde/import', asyncHandler(async (req, res) => {
  const dir = String(req.body.dir || '').trim();
  const limit = Math.max(0, Number(req.body.limit || 0));
  if (!dir) throw new Error('请填写服务器上的 JSONL SDE 解压目录。');
  const result = await importSdeDirectory(dir, { limit });
  const counts = await getCounts();
  res.render('admin/sde', { title: '管理员 SDE 导入', active: 'sde', counts, result, error: '' });
}));

adminRoutes.post('/sde/seed-reset', asyncHandler(async (req, res) => {
  const result = await seedDefaultSde({ reset: true });
  const counts = await getCounts();
  res.render('admin/sde', { title: '管理员 SDE 导入', active: 'sde', counts, result, error: '' });
}));

adminRoutes.get('/ops', asyncHandler(async (req, res) => {
  const [users, characters] = await Promise.all([User.countDocuments(), Character.countDocuments()]);
  res.render('admin/ops', { title: '运营面板', active: 'ops', users, characters });
}));

adminRoutes.use((err, req, res, next) => {
  console.error('[admin]', err);
  getCounts().then(counts => {
    res.status(400).render('admin/sde', { title: '管理员 SDE 导入', active: 'sde', counts, result: null, error: err.message || '操作失败' });
  }).catch(next);
});

async function getCounts() {
  const [types, systems, blueprints, groups, categories, marketGroups] = await Promise.all([
    SdeType.estimatedDocumentCount(),
    SdeSystem.estimatedDocumentCount(),
    SdeBlueprint.estimatedDocumentCount(),
    SdeGroup.estimatedDocumentCount(),
    SdeCategory.estimatedDocumentCount(),
    SdeMarketGroup.estimatedDocumentCount()
  ]);
  return { types, systems, blueprints, groups, categories, marketGroups };
}
