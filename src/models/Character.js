import mongoose from 'mongoose';

const itemStackSchema = new mongoose.Schema({
  typeId: { type: String, required: true, index: true },
  name: String,
  zh: String,
  kind: String,
  quantity: { type: Number, default: 0 },
  volume: { type: Number, default: 0.01 },
  basePrice: { type: Number, default: 1 },
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
  tier: Number,
  groupKey: String,
  mode: { type: String, enum: ['passive', 'active'], default: 'passive' },
  state: { type: String, enum: ['passive', 'active', 'idle', 'offline'], default: 'passive' },
  fitting: mongoose.Schema.Types.Mixed,
  activation: mongoose.Schema.Types.Mixed,
  charge: mongoose.Schema.Types.Mixed,
  effects: mongoose.Schema.Types.Mixed,
  online: { type: Boolean, default: true }
}, { _id: false });

const shipSchema = new mongoose.Schema({
  instanceId: String,
  typeId: String,
  name: String,
  zh: String,
  class: String,
  role: String,
  stats: mongoose.Schema.Types.Mixed,
  slots: mongoose.Schema.Types.Mixed,
  fitting: mongoose.Schema.Types.Mixed,
  runtime: mongoose.Schema.Types.Mixed,
  fittedModules: [fittedModuleSchema],
  insured: { type: Boolean, default: true },
  skin: String
}, { _id: false });

const skillJobSchema = new mongoose.Schema({
  skillId: String,
  targetLevel: Number,
  secondsRemaining: Number,
  totalSeconds: Number,
  queuedAt: Date
}, { _id: false });

const skillsSchema = new mongoose.Schema({
  combat: { type: Number, default: 1 },
  weaponSystems: { type: Number, default: 0 },
  gunnery: { type: Number, default: 0 },
  missiles: { type: Number, default: 0 },
  drones: { type: Number, default: 0 },
  shieldOperation: { type: Number, default: 0 },
  armorRepairSystems: { type: Number, default: 0 },
  capacitorManagement: { type: Number, default: 0 },
  weaponUpgrades: { type: Number, default: 0 },
  mining: { type: Number, default: 1 },
  scanning: { type: Number, default: 1 },
  industry: { type: Number, default: 1 },
  trade: { type: Number, default: 1 },
  command: { type: Number, default: 1 },
  salvage: { type: Number, default: 1 },
  security: { type: Number, default: 1 },
  navigation: { type: Number, default: 0 },
  caldariFrigate: { type: Number, default: 0 },
  gallenteFrigate: { type: Number, default: 0 },
  amarrFrigate: { type: Number, default: 0 },
  minmatarFrigate: { type: Number, default: 0 }
}, { _id: false });

const charSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 28, index: true },
  race: { type: String, default: 'caldari', index: true },
  corp: { type: String, default: '自由深空承包人' },
  credits: { type: Number, default: 25000 },
  plex: { type: Number, default: 0 },
  skillpoints: { type: Number, default: 0 },
  skillTraining: { queue: [skillJobSchema] },
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
  skills: { type: skillsSchema, default: () => ({}) },
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
    bountyEarned: { type: Number, default: 0 }
  },
  walletJournal: [{ at: Date, type: String, amount: Number, note: String }],
  fleetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Fleet', index: true },
  lastTickAt: { type: Date, default: Date.now },
  lastSeenAt: Date
}, { timestamps: true });

charSchema.index({ credits: -1 });
charSchema.index({ 'stats.totalEarned': -1 });
charSchema.index({ currentSystemId: 1, locationState: 1 });

export const Character = mongoose.model('Character', charSchema);
