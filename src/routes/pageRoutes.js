import express from 'express';
import { Character, GameEvent, SdeSystem, SdeType, SdeBlueprint, IndustryJob, Fleet } from '../models/index.js';
import { requireAuth, asyncHandler } from '../middleware/auth.js';
import { tickCharacter } from '../services/gameEngine.js';

export const pageRoutes = express.Router();

pageRoutes.get('/', asyncHandler(async (req, res) => {
  const [pilots, events] = await Promise.all([
    Character.estimatedDocumentCount(),
    GameEvent.find({ scope: { $in: ['global', 'system'] } }).sort({ createdAt: -1 }).limit(6).lean()
  ]);
  res.render('index', { title: 'EVE Idle Game', active: 'home', pilots, events });
}));

const pages = [
  ['command', '指挥室'],
  ['star-map', '星图'],
  ['hangar', '船坞装配'],
  ['warehouse', '仓库囤积'],
  ['market', '区域市场'],
  ['industry', '工业制造'],
  ['fleet', '舰队大厅'],
  ['sde', 'SDE 资料库'],
  ['leaderboard', '排行榜'],
  ['codex', '玩法手册']
];

for (const [slug, title] of pages) {
  pageRoutes.get(`/${slug}`, requireAuth, asyncHandler(async (req, res) => {
    const characterDoc = await Character.findOne({ userId: req.session.userId });
    if (characterDoc) await tickCharacter(characterDoc, new Date(), req.app.get('io'));
    const fresh = characterDoc ? await Character.findById(characterDoc._id).lean() : null;
    const payload = { title, active: slug, character: fresh };
    if (slug === 'industry') payload.jobs = await IndustryJob.find({ characterId: fresh?._id, status: { $in: ['running', 'ready'] } }).sort({ readyAt: 1 }).lean();
    if (slug === 'fleet') payload.fleets = await Fleet.find({ status: { $in: ['forming', 'running'] } }).sort({ updatedAt: -1 }).limit(20).lean();
    if (slug === 'sde') payload.sdeCounts = {
      types: await SdeType.estimatedDocumentCount(),
      systems: await SdeSystem.estimatedDocumentCount(),
      blueprints: await SdeBlueprint.estimatedDocumentCount()
    };
    res.render(`pages/${slug}`, payload);
  }));
}
