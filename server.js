/**
 * GÖLGE KÖYÜ - Çoklu Oyunculu Sunucu
 * ------------------------------------
 * Node.js + Socket.io sunucusu. Oda kurma/katılma, rol dağıtımı,
 * gece/gündüz/oylama faz senkronizasyonu ve sohbet aktarımı burada.
 *
 * ŞU AN TAM ÇALIŞAN ROLLER (online modda): Katil (MAFIA), Doktor (DOCTOR),
 * Dedektif (SHERIFF). Diğer roller (İnfazcı, Muhafız, Oyalayıcı, Soytarı)
 * online oyunda ATANIYOR ve kazanma hesabına dahil ediliyor, ama gece
 * özel yetenekleri henüz botlara-karşı modundaki kadar gelişkin değil —
 * o oyuncular o gece "uyur" gibi davranır. Yerel (botlara karşı) modda
 * hepsi tam çalışıyor.
 *
 * ÇALIŞTIRMA:
 *   npm install && node server.js  -> http://localhost:3000
 *
 * ÜCRETSİZ DEPLOY: Render.com / Railway.app / Glitch.com / Fly.io
 *   Bu klasörü GitHub'a atıp Node.js servisi olarak bağlayın.
 *   Start command: node server.js
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
  7: ['MAFIA','MAFIA','DOCTOR','SHERIFF','VIGILANTE','VILLAGER','VILLAGER'],
  8: ['MAFIA','MAFIA','DOCTOR','SHERIFF','VIGILANTE','BODYGUARD','VILLAGER','VILLAGER'],
  9: ['MAFIA','MAFIA','DOCTOR','SHERIFF','VIGILANTE','BODYGUARD','ESCORT','JESTER','VILLAGER'],
};
const DISCUSSION_SECONDS = 30;
const VOTE_SECONDS = 20;

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

function aliveMafia(room){ return room.players.filter(p=>p.alive && p.role==='MAFIA'); }
function aliveTown(room){ return room.players.filter(p=>p.alive && p.role!=='MAFIA' && p.role!=='JESTER'); }

function checkWinAndMaybeEnd(room, code){
  const m = aliveMafia(room).length;
  const t = aliveTown(room).length;
  if(m===0){ io.to(code).emit('game:end', { winner:'town', message:'Köy kazandı! Tüm katiller bertaraf edildi.' }); room.phase='LOBBY'; return true; }
  if(m>=t){ io.to(code).emit('game:end', { winner:'mafia', message:'Katiller kazandı! Köy ele geçirildi.' }); room.phase='LOBBY'; return true; }
  return false;
}

function goToVote(room, code){
  if(!room || room.phase!=='DAY') return;
  room.phase = 'VOTE';
  room.votes = {};
  io.to(code).emit('room:update', publicState(room));
  io.to(code).emit('phase:change', { phase: room.phase, round: room.round });
  clearTimeout(room._voteTimer);
  room._voteTimer = setTimeout(()=>tallyVotesForRoom(room, code), VOTE_SECONDS*1000);
}

function tallyVotesForRoom(room, code){
  if(!room || room.phase!=='VOTE') return;
  const tally = {};
  Object.values(room.votes).forEach(id => { tally[id] = (tally[id] || 0) + 1; });
  let max = 0, top = [];
  Object.entries(tally).forEach(([id, c]) => {
    if (c > max) { max = c; top = [id]; } else if (c === max) top.push(id);
  });
  let executedName = null, executedIsJester = false;
  if (top.length === 1 && max > 0) {
    const v = room.players.find(p => p.id === top[0]);
    if (v) { v.alive = false; executedName = v.name; executedIsJester = v.role==='JESTER'; }
  }
  room.votes = {};
  io.to(code).emit('vote:result', { executedName });
  io.to(code).emit('room:update', publicState(room));

  if(executedIsJester){
    io.to(code).emit('game:end', { winner:'jester', message:'Soytarı halkı kandırıp astırmayı başardı!' });
    room.phase = 'LOBBY';
    return;
  }
  room.round += 1;
  if(checkWinAndMaybeEnd(room, code)) return;
  room.phase = 'NIGHT';
  room.night = {};
  io.to(code).emit('phase:change', { phase: room.phase, round: room.round });
}

io.on('connection', (socket) => {

  socket.on('room:create', ({ name }) => {
    const code = makeRoomCode();
    rooms[code] = {
      code,
      players: [{ id: socket.id, name: (name||'Oyuncu').slice(0,16), alive: true, role: null }],
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
    if (room.players.length >= 9) return socket.emit('room:error', 'Oda dolu (maksimum 9 oyuncu).');
    room.players.push({ id: socket.id, name: (name||'Oyuncu').slice(0,16), alive: true, role: null });
    socket.join(code);
    socket.data.room = code;
    io.to(code).emit('room:update', publicState(room));
  });

  socket.on('room:start', () => {
    const code = socket.data.room;
    const room = rooms[code];
    if (!room) return;
    const roleSet = ROLES_BY_COUNT[room.players.length];
    if (!roleSet) return socket.emit('room:error', `Bu oyun 5-9 oyuncu ile oynanır (şu an ${room.players.length}).`);
    const shuffledRoles = shuffle(roleSet);
    room.players.forEach((p, i) => { p.role = shuffledRoles[i]; p.alive = true; });
    room.phase = 'NIGHT';
    room.round = 1;
    room.night = {};

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
    if (!room || room.phase !== 'NIGHT') return;
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

    if(checkWinAndMaybeEnd(room, code)) return;

    io.to(code).emit('phase:change', { phase: room.phase, round: room.round });
    clearTimeout(room._voteTimer);
    room._voteTimer = setTimeout(()=>goToVote(room, code), DISCUSSION_SECONDS*1000);
  });

  socket.on('chat:message', ({ text }) => {
    const code = socket.data.room;
    const room = rooms[code];
    if (!room) return;
    const p = room.players.find(pl => pl.id === socket.id);
    io.to(code).emit('chat:message', { name: p?.name || '???', text: String(text).slice(0,300) });
  });

  socket.on('vote:cast', ({ targetId }) => {
    const code = socket.data.room;
    const room = rooms[code];
    if (!room || room.phase !== 'VOTE') return;
    const voter = room.players.find(p=>p.id===socket.id);
    if(!voter || !voter.alive) return;
    room.votes[socket.id] = targetId;
    io.to(code).emit('vote:update', room.votes);
    const aliveCount = room.players.filter(p=>p.alive).length;
    if(Object.keys(room.votes).length >= aliveCount){
      clearTimeout(room._voteTimer);
      tallyVotesForRoom(room, code);
    }
  });

  socket.on('vote:tally', () => {
    const code = socket.data.room;
    const room = rooms[code];
    if (!room) return;
    clearTimeout(room._voteTimer);
    tallyVotesForRoom(room, code);
  });

  socket.on('disconnect', () => {
    const code = socket.data.room;
    const room = rooms[code];
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    if (room.players.length === 0) { clearTimeout(room._voteTimer); delete rooms[code]; }
    else io.to(code).emit('room:update', publicState(room));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Gölge Köyü sunucusu ${PORT} portunda çalışıyor`));
