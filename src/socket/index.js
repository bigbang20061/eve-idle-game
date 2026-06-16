import { Server } from 'socket.io';
import { Character, ChatMessage, Fleet } from '../models/index.js';
import { safeText } from '../services/formulas.js';

export function createSocketServer(httpServer, sessionMiddleware) {
  const io = new Server(httpServer, {
    cors: { origin: false },
    connectionStateRecovery: { maxDisconnectionDuration: 120000 }
  });

  io.engine.use(sessionMiddleware);

  io.use(async (socket, next) => {
    const userId = socket.request.session?.userId;
    if (!userId) return next(new Error('unauthorized'));
    const character = await Character.findOne({ userId }).lean();
    if (!character) return next(new Error('no character'));
    socket.data.userId = userId;
    socket.data.characterId = String(character._id);
    socket.data.characterName = character.name;
    socket.data.systemId = character.currentSystemId;
    socket.data.fleetId = character.fleetId ? String(character.fleetId) : '';
    next();
  });

  io.on('connection', async socket => {
    socket.join('global');
    socket.join(`character:${socket.data.characterId}`);
    if (socket.data.systemId) socket.join(`system:${socket.data.systemId}`);
    if (socket.data.fleetId) socket.join(`fleet:${socket.data.fleetId}`);

    await Character.updateOne({ _id: socket.data.characterId }, { $set: { lastSeenAt: new Date() } });
    io.to('global').emit('presence:update', await presenceSummary(io));

    socket.on('chat:send', async payload => {
      const channel = ['global', 'system', 'fleet'].includes(payload?.channel) ? payload.channel : 'global';
      const text = safeText(payload?.text || '', 280);
      if (!text) return;
      const msg = await ChatMessage.create({
        channel,
        userId: socket.data.userId,
        characterId: socket.data.characterId,
        name: socket.data.characterName,
        text,
        systemId: socket.data.systemId,
        fleetId: socket.data.fleetId || undefined
      });
      const publicMsg = { id: String(msg._id), channel, name: msg.name, text: msg.text, createdAt: msg.createdAt };
      if (channel === 'system' && socket.data.systemId) io.to(`system:${socket.data.systemId}`).emit('chat:message', publicMsg);
      else if (channel === 'fleet' && socket.data.fleetId) io.to(`fleet:${socket.data.fleetId}`).emit('chat:message', publicMsg);
      else io.to('global').emit('chat:message', publicMsg);
    });

    socket.on('fleet:ping', async payload => {
      if (!socket.data.fleetId) return;
      const text = safeText(payload?.text || '舰队集合', 160);
      const fleet = await Fleet.findById(socket.data.fleetId);
      if (!fleet) return;
      fleet.log.unshift(`${socket.data.characterName}: ${text}`);
      await fleet.save();
      io.to(`fleet:${socket.data.fleetId}`).emit('fleet:ping', { name: socket.data.characterName, text, createdAt: new Date() });
    });

    socket.on('disconnect', async () => {
      await Character.updateOne({ _id: socket.data.characterId }, { $set: { lastSeenAt: new Date() } });
      io.to('global').emit('presence:update', await presenceSummary(io));
    });
  });

  return io;
}

async function presenceSummary(io) {
  const sockets = await io.in('global').fetchSockets();
  const pilots = sockets.map(s => ({ characterId: s.data.characterId, name: s.data.characterName, systemId: s.data.systemId }));
  return { online: pilots.length, pilots };
}
