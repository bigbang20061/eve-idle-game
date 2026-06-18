import express from 'express';
import { Character } from '../models/index.js';
import { requireAuth, asyncHandler } from '../middleware/auth.js';
import { combatUiOptions } from '../services/combatRules.js';
import { dogmaUiSummary } from '../services/dogmaMapper.js';
import { fittingUiOptions } from '../services/fittingSystem.js';
import { skillOptions } from '../services/skillSystem.js';
import { t } from '../services/i18n.js';

export const combatApiRoutes = express.Router();
combatApiRoutes.use(requireAuth);

async function getCharacter(req) {
  const character = await Character.findOne({ userId: req.session.userId });
  if (!character) throw new Error(t('error.character_missing'));
  return character;
}

combatApiRoutes.get('/options', asyncHandler(async (req, res) => {
  res.json({ ok: true, combat: combatUiOptions(), dogma: dogmaUiSummary(), fitting: fittingUiOptions(), skills: skillOptions() });
}));

combatApiRoutes.post('/settings', asyncHandler(async (req, res) => {
  const character = await getCharacter(req);
  const options = combatUiOptions();
  const body = req.body || {};
  if (!character.autopilot.combat) character.autopilot.combat = {};
  if (options.stances[String(body.combatStance)]) character.autopilot.combat.stance = String(body.combatStance);
  if (options.damageProfiles[String(body.damageProfile)]) character.autopilot.combat.damageProfile = String(body.damageProfile);
  if (options.targetPriorities[String(body.targetPriority)]) character.autopilot.combat.targetPriority = String(body.targetPriority);
  character.markModified('autopilot');
  await character.save();
  res.json({ ok: true, combat: character.autopilot.combat });
}));

combatApiRoutes.use((err, req, res, next) => {
  console.error('[combat-api]', err);
  res.status(err.status || 400).json({ ok: false, error: err.message || t('error.combat_settings_failed') });
});
