import mongoose from 'mongoose';

const itemStackSchema = new mongoose.Schema({
  typeId: { type: String, required: true, index: true },
  name: String,
  zh: String,
  kind: String,
  quantity: { type: Number, default: 0 },
  volume: { type: Number, default: 0.01 },
  basePrice: { type: Number, default: 1 },
  chargeGroup: String,
  locked: { type: Boolean, default: false },
  source: String,
  meta: mongoose.Schema.Types.Mixed
}, { _id: false });

const fittedModuleSchema = new mongoose.Schema({
  instanceId: String,
  typeId: String,
  name: String,
  zh: String,
  slot: String,
  kind: String,
  role: String,
  tier: Number,
  mode: { type: String, enum: ['passive', 'active', 'weapon'], default: 'passive' },
  cpu: { type: Number, default: 0 },
  powergrid: { type: Number, default: 0 },
  calibration: { type: Number, default: 0 },
  requirements: mongoose.Schema.Types.Mixed,
  passiveEffects: mongoose.Schema.Types.Mixed,
  activeEffects: mongoose.Schema.Types.Mixed,
  effects: mongoose.Schema.Types.Mixed,
  activation: mongoose.Schema.Types.Mixed,
  chargeGroup: String,
  chargesLoaded: { type: Number, default: 0 },
  online: { type: Boolean, default: true },
  active: { type: Boolean, default: false },
  lastActivatedAt: Date,
  cycleEndsAt: Date,
  meta: mongoose.Schema.Types.Mixed
}, { _id: false });

const shipSchema = new mongoose.Schema({
  instanceId: String,
  typeId: String,
  name: String,
  zh: String,
  class: String,
  role: String,
  race: String,
  stats: mongoose.Schema.Types.Mixed,
  slots: mongoose.Schema.Types.Mixed,
  fittedModules: [fittedModuleSchema],
  activeEffects: [mongoose.Schema.Types.Mixed],
  insured: { type: Boolean, default: true },
  skin: String
}, { _id: false });

const skillTrainingPlanSchema = new mongoose.Schema({
  skillId: String,
  label: String,
  targetLevel: Number,
  secondsRequired: Number,
  startedAt: Date,
  readyAt: Date,
  completedAt: Date
}, { _id: false });

const charSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 28, index: true },
  race: { type: String, default: 'independent', index: true },
  corp: { type: String, default: '自由深空承包人' },
  credits: { type: Number, default: 25000 },
  plex: { type: Number, default: 0 },
  skillpoints: { type: Number, default: 0 },
  notoriety: { type: Number, default: 0 },
  securityStanding: { type: Number, default: 0 },
  currentSystemId: { type: String, index: true },
  homeSystemId: { type: String, default: '30000142' },
  cloneStationId: { type: String, default: '30000142' },
  locationState: { type: String, enum: ['docked', 'space', 'warp', 'offline'], default: 'docked' },
  ship: shipSchema,
  hangarShips: [shipSchema],
  cargo: [itemStackSchema],
  warehouse: {
    capacity: { type: Number, default: 50000 },
    items: [itemStackSchema],
    reserve: { type: Map, of: Number, default: {} }
  },
  escrow: [itemStackSchema],
  skills: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({ combat: 1, mining: 1, scanning: 1, industry: 1, trade: 1, command: 1, salvage: 1, security: 1 })
  },
  skillTraining: {
    active: skillTrainingPlanSchema,
    queue: [skillTrainingPlanSchema],
    history: [skillTrainingPlanSchema]
  },
  autopilot: {
    enabled: { type: Boolean, default: true },
    activity: { type: String, enum: ['mining', 'ratting', 'relic', 'data', 'hauling', 'combat'], default: 'mining' },
    risk: { type: Number, default: 0.35 },
    targetSystemId: String,
    allowLowSec: { type: Boolean, default: false },
    sellExcess: { type: Boolean, default: true },
    refineOre: { type: Boolean, default: false },
    minShieldPct: { type: Number, default: 0.35 },
    combat: {
      stance: String,
      damageProfile: String,
      targetPriority: String
    },
    loop: { type: Boolean, default: true }
  },
  expedition: {
    state: { type: String, enum: ['idle', 'scanning', 'warping', 'fighting', 'looting', 'extracting', 'repairing'], default: 'idle' },
    site: mongoose.Schema.Types.Mixed,
    progress: { type: Number, default: 0 },
    enemyHull: { type: Number, default: 0 },
    hazard: { type: Number, default: 0 },
    startedAt: Date,
    log: [String]
  },
  stats: {
    totalEarned: { type: Number, default: 0 },
    sorties: { type: Number, default: 0 },
    extractions: { type: Number, default: 0 },
    kills: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    minedM3: { type: Number, default: 0 },
    manufactured: { type: Number, default: 0 },
    trades: { type: Number, default: 0 },
    bestLoot: { type: Number, default: 0 },
    damageDealt: { type: Number, default: 0 },
    damageTaken: { type: Number, default: 0 },
    bountyEarned: { type: Number, default: 0 },
    modulesActivated: { type: Number, default: 0 },
    chargesConsumed: { type: Number, default: 0 },
    skillsCompleted: { type: Number, default: 0 }
  },
  walletJournal: [{ at: Date, type: String, amount: Number, note: String }],
  fleetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Fleet', index: true },
  lastTickAt: { type: Date, default: Date.now },
  lastSeenAt: Date
}, { timestamps: true });

charSchema.index({ credits: -1 });
charSchema.index({ 'stats.totalEarned': -1 });
charSchema.index({ currentSystemId: 1, locationState: 1 });
charSchema.index({ race: 1, credits: -1 });

export const Character = mongoose.model('Character', charSchema);
