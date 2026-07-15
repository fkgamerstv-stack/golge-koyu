/**
 * GÖLGE KÖYÜ - Çoklu Oyunculu Sunucu İskeleti
 * ---------------------------------------------
 * Bu, gerçek internet üzerinden birden fazla oyuncunun aynı odada
 * oynayabilmesi için temel bir Node.js + Socket.io sunucusudur.
 *
 * index.html'deki tek-oyunculu (bot'lara karşı) oyun motoru henüz bu
 * sunucuya bağlı DEĞİL — bu dosya, o entegrasyonu yapmanız için sağlam
 * bir iskele/temel sunar: oda oluşturma, katılma, rol dağıtımı,
 * faz senkronizasyonu ve sohbet aktarımı burada hazır.
 *
 * ÇALIŞTIRMA:
 *   npm install
 *   node server.js
 *   -> http://localhost:3000
 *
 * ÜCRETSİZ DEPLOY (arkadaşlarınızla internetten oynamak için):
 *   - Render.com  (Web Service, ücretsiz plan)
 *   - Railway.app
 *   - Glitch.com
 *   - Fly.io
 *   Hepsinde: bu klasörü GitHub'a atıp "Node.js" servisi olarak bağlayın,
 *   start command: `node server.js`
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const ROLES_BY_COUNT = {
  5: ['MAFIA','DOCTOR','SHERIFF','VILLAGER','VILLAGER'],
  6: ['MAFIA','MAFIA','DOCTOR','SHERIFF','VILLAGER','VILLAGER'],
  7: ['MAFIA','MAFIA','DOCTOR','SHERIFF','VILLAGER','VILLAGER','VILLAGER'],
  8: ['MAFIA','MAFIA','DOCTOR','SHERIFF','VILLAGER','VILLAGER','VILLAGER','VILLAGER'],
};

/** rooms = { code: { players:[{id,name,role,alive}], phase, round, votes:{}, night:{} } } */
const rooms = {};

function makeRoomCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for(let i=0;i<5;i++) code += chars[Math.floor(Math.random()*chars.length)];
  return rooms[code] ? makeRoomCode() : code;
}

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function publicState(room){
  return {
    code: room.code,
    phase: room.phase,
    round: room.round,
    players: room.players.map(p => ({ id:p.id, name:p.name, alive:p.alive })),
  };
}

io.on('connection', (socket) => {

  socket.on('room:create', ({ name }) => {
    const code = makeRoomCode();
    rooms[code] = {
      code,
      players: [{ id: socket.id, name, alive: true, role: null }],
      phase: 'LOBBY',
      round: 1,
      votes: {},
      night: {},
    };
    socket.join(code);
    socket.data.room = code;
    io.to(code).emit('room:update', publicState(rooms[code]));
  });

  socket.on('room:join', ({ code, name }) => {
    const room = rooms[code];
    if (!room) return socket.emit('room:error', 'Oda bulunamadı.');
    if (room.phase !== 'LOBBY') return socket.emit('room:error', 'Oyun zaten başladı.');
    room.players.push({ id: socket.id, name, alive: true, role: null });
    socket.join(code);
    socket.data.room = code;
    io.to(code).emit('room:update', publicState(room));
  });

  socket.on('room:start', () => {
    const code = socket.data.room;
    const room = rooms[code];
    if (!room) return;
    const roleSet = ROLES_BY_COUNT[room.players.length];
    if (!roleSet) return socket.emit('room:error', `Bu oyun 5-8 oyuncu ile oynanır (şu an ${room.players.length}).`);
    const shuffledRoles = shuffle(roleSet);
    room.players.forEach((p, i) => { p.role = shuffledRoles[i]; });
    room.phase = 'NIGHT';
    room.round = 1;

    // her oyuncuya SADECE kendi rolünü gönder
    room.players.forEach(p => {
      io.to(p.id).emit('role:assign', { role: p.role });
    });
    io.to(code).emit('room:update', publicState(room));
    io.to(code).emit('phase:change', { phase: room.phase, round: room.round });
  });

  socket.on('night:action', ({ targetId }) => {
    const code = socket.data.room;
    const room = rooms[code];
    if (!room || room.phase !== 'NIGHT') return;
    const actor = room.players.find(p => p.id === socket.id);
    if (!actor || !actor.alive) return;
    if (actor.role === 'MAFIA') room.night.mafiaTarget = targetId;
    if (actor.role === 'DOCTOR') room.night.doctorTarget = targetId;
    if (actor.role === 'SHERIFF') {
      const target = room.players.find(p => p.id === targetId);
      socket.emit('sheriff:result', { name: target?.name, isMafia: target?.role === 'MAFIA' });
    }
  });

  socket.on('night:resolve', () => {
    const code = socket.data.room;
    const room = rooms[code];
    if (!room) return;
    const victimId = room.night.mafiaTarget;
    const saved = victimId && room.night.doctorTarget === victimId;
    let deadName = null;
    if (victimId && !saved) {
      const v = room.players.find(p => p.id === victimId);
      if (v) { v.alive = false; deadName = v.name; }
    }
    room.night = {};
    room.phase = 'DAY';
    io.to(code).emit('night:result', { deadName, saved: !!saved && !!victimId });
    io.to(code).emit('room:update', publicState(room));
    io.to(code).emit('phase:change', { phase: room.phase, round: room.round });
  });

  socket.on('chat:message', ({ text }) => {
    const code = socket.data.room;
    const room = rooms[code];
    if (!room) return;
    const p = room.players.find(pl => pl.id === socket.id);
    io.to(code).emit('chat:message', { name: p?.name || '???', text });
  });

  socket.on('vote:cast', ({ targetId }) => {
    const code = socket.data.room;
    const room = rooms[code];
    if (!room || room.phase !== 'VOTE') return;
    room.votes[socket.id] = targetId;
    io.to(code).emit('vote:update', room.votes);
  });

  socket.on('vote:tally', () => {
    const code = socket.data.room;
    const room = rooms[code];
    if (!room) return;
    const tally = {};
    Object.values(room.votes).forEach(id => { tally[id] = (tally[id] || 0) + 1; });
    let max = 0, top = [];
    Object.entries(tally).forEach(([id, c]) => {
      if (c > max) { max = c; top = [id]; } else if (c === max) top.push(id);
    });
    let executedName = null;
    if (top.length === 1 && max > 0) {
      const v = room.players.find(p => p.id === top[0]);
      if (v) { v.alive = false; executedName = v.name; }
    }
    room.votes = {};
    room.round += 1;
    room.phase = 'NIGHT';
    io.to(code).emit('vote:result', { executedName });
    io.to(code).emit('room:update', publicState(room));
    io.to(code).emit('phase:change', { phase: room.phase, round: room.round });
  });

  socket.on('disconnect', () => {
    const code = socket.data.room;
    const room = rooms[code];
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    if (room.players.length === 0) delete rooms[code];
    else io.to(code).emit('room:update', publicState(room));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Gölge Köyü sunucusu ${PORT} portunda çalışıyor`));
