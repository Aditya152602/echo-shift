import { getStore } from '@netlify/blobs';

const STORE_NAME = 'echo-shift-rooms-v1';
const MAX_PLAYERS = 8;
const MAX_ROUNDS = 5;
const SYMBOLS = ['◆','●','▲','■','✦','⬟','✚','◉'];
const now = () => Date.now();
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const fail = (message, status = 400) => json({ error: message }, status);
const cleanName = value => String(value ?? '').trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 18);
const validCode = value => /^[A-Z0-9]{6}$/.test(String(value ?? '').toUpperCase());
const playerId = () => crypto.randomUUID();
const randomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X');
const roomKey = code => `room:${String(code).toUpperCase()}`;
const lockKey = code => `lock:${String(code).toUpperCase()}`;

function challengeFor(round, pulse = false) {
  const length = Math.min(3 + round, 8);
  const sequence = Array.from({ length }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
  if (pulse) {
    const original = sequence[sequence.length - 1];
    const choices = SYMBOLS.filter(s => s !== original);
    sequence[sequence.length - 1] = choices[Math.floor(Math.random() * choices.length)];
  }
  const correct = sequence[sequence.length - 1];
  const distractors = SYMBOLS.filter(s => s !== correct).sort(() => Math.random() - 0.5).slice(0, 3);
  const options = [...distractors, correct].sort(() => Math.random() - 0.5);
  return { sequence, options, answerIndex: options.indexOf(correct) };
}
function newChallenges(room) {
  room.challenges = {};
  for (const p of room.players) {
    room.challenges[p.id] = challengeFor(room.round, p.pulsePenalty > 0);
    p.pulsePenalty = 0;
    p.shielded = false;
    p.lastAnswerRound = 0;
  }
  const first = room.players[0] ? room.challenges[room.players[0].id] : challengeFor(room.round);
  room.sequence = first.sequence;
  room.options = first.options;
  room.answerIndex = first.answerIndex;
}
function publicRoom(room) {
  const clone = structuredClone(room);
  // Answer keys are never sent to clients. The server alone evaluates them.
  delete clone.answerIndex;
  if (clone.challenges) for (const challenge of Object.values(clone.challenges)) delete challenge.answerIndex;
  return clone;
}
async function readRoom(store, code) {
  const value = await store.get(roomKey(code), { type: 'json', consistency: 'strong' });
  return value || null;
}
async function withRoomLock(store, code, operation) {
  const key = lockKey(code);
  const token = crypto.randomUUID();
  let locked = false;
  let lockEtag;
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await store.set(key, JSON.stringify({ token, at: now() }), { onlyIfNew: true });
    if (result.modified) { locked = true; lockEtag = result.etag; break; }
    const existing = await store.getWithMetadata(key, { consistency: 'strong', type: 'json' });
    if (!existing.data) continue;
    const old = existing.data;
    if (now() - Number(old.at || 0) > 4000 && existing.etag) {
      const stolen = await store.set(key, JSON.stringify({ token, at: now() }), { onlyIfMatch: existing.etag });
      if (stolen.modified) { locked = true; lockEtag = stolen.etag; break; }
    }
    await new Promise(resolve => setTimeout(resolve, 25 + Math.floor(Math.random() * 35)));
  }
  if (!locked) throw Object.assign(new Error('The room is busy. Please retry in a moment.'), { status: 409 });
  try { return await operation(); }
  finally {
    const latest = await store.getWithMetadata(key, { consistency: 'strong', type: 'json' }).catch(() => null);
    if (latest?.data?.token === token && latest.etag) await store.delete(key, { onlyIfMatch: latest.etag }).catch(() => {});
  }
}
async function mutateRoom(store, code, operation) {
  return withRoomLock(store, code, async () => {
    const room = await readRoom(store, code);
    if (!room) throw Object.assign(new Error('Room not found. Check the code and try again.'), { status: 404 });
    const result = await operation(room);
    room.revision = (room.revision || 0) + 1;
    const current = await store.getWithMetadata(roomKey(code), { consistency: 'strong', type: 'json' });
    if (!current.data || !current.etag) throw Object.assign(new Error('Room state changed. Please retry.'), { status: 409 });
    const saved = await store.set(roomKey(code), JSON.stringify(room), { onlyIfMatch: current.etag });
    if (!saved.modified) throw Object.assign(new Error('Room state changed. Please retry.'), { status: 409 });
    return result === undefined ? room : result;
  });
}
function getPlayer(room, id) {
  const player = room.players.find(p => p.id === id);
  if (!player) throw Object.assign(new Error('You are not in this room. Rejoin using the room code.'), { status: 403 });
  return player;
}
function requireHost(room, id) {
  if (room.hostId !== id) throw Object.assign(new Error('Only the room host can do that.'), { status: 403 });
}
function beginRound(room, phase = 'memorize') {
  room.phase = phase;
  room.phaseEndsAt = now() + (phase === 'memorize' ? 7000 : phase === 'answer' ? 15000 : 0);
  room.roundResults = [];
  room.usedMoves = [];
  newChallenges(room);
}
async function advanceIfExpired(store, code) {
  const room = await readRoom(store, code);
  if (!room || now() < room.phaseEndsAt || !['memorize', 'answer'].includes(room.phase)) return room;
  return mutateRoom(store, code, current => {
    if (now() < current.phaseEndsAt || !['memorize', 'answer'].includes(current.phase)) return current;
    if (current.phase === 'memorize') {
      current.phase = 'answer'; current.phaseEndsAt = now() + 15000;
    } else {
      for (const p of current.players) {
        if (p.lastAnswerRound !== current.round) current.roundResults.push({ playerId: p.id, correct: false, points: 0, responseMs: 15000 });
      }
      current.phase = 'results'; current.phaseEndsAt = now() + 60000;
    }
    return current;
  });
}

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
  if (request.method !== 'POST') return fail('Use POST for game actions.', 405);
  let body;
  try { body = await request.json(); } catch { return fail('Request body must be valid JSON.'); }
  const action = String(body.action || '');
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });
  try {
    if (action === 'create') {
      const name = cleanName(body.name);
      if (!name) return fail('Enter a display name first.');
      let room;
      for (let i = 0; i < 5; i++) {
        const code = randomCode();
        const id = playerId();
        const player = { id, name, score: 0, energy: 0, ready: true, connectedAt: now(), shielded: false, pulsePenalty: 0, answers: 0, correct: 0, totalResponseMs: 0, lastAnswerRound: 0 };
        room = { code, hostId: id, phase: 'lobby', round: 0, maxRounds: MAX_ROUNDS, createdAt: now(), phaseEndsAt: 0, sequence: [], options: [], answerIndex: 0, challenges: {}, players: [player], usedMoves: [], roundResults: [], revision: 1 };
        const result = await store.set(roomKey(code), JSON.stringify(room), { onlyIfNew: true });
        if (result.modified) return json({ room: publicRoom(room), playerId: id });
      }
      return fail('Could not allocate a room. Please try again.', 503);
    }
    if (action === 'join') {
      const code = String(body.code || '').toUpperCase(); const name = cleanName(body.name);
      if (!validCode(code) || !name) return fail('Enter a valid six-character room code and display name.');
      const result = await mutateRoom(store, code, room => {
        if (room.phase !== 'lobby') throw Object.assign(new Error('This game has already started.'), { status: 409 });
        if (room.players.length >= MAX_PLAYERS) throw Object.assign(new Error('This room is full (8 players maximum).'), { status: 409 });
        const id = playerId();
        room.players.push({ id, name, score: 0, energy: 0, ready: false, connectedAt: now(), shielded: false, pulsePenalty: 0, answers: 0, correct: 0, totalResponseMs: 0, lastAnswerRound: 0 });
        return { room: publicRoom(room), playerId: id };
      });
      return json(result);
    }
    const code = String(body.code || '').toUpperCase(); const id = String(body.playerId || '');
    if (!validCode(code)) return fail('Enter a valid six-character room code.');
    if (action === 'state') {
      const room = await advanceIfExpired(store, code);
      if (!room) return fail('Room not found. Check the code and try again.', 404);
      if (!room.players.some(p => p.id === id)) return fail('You are not in this room. Rejoin using the room code.', 403);
      return json({ room: publicRoom(room) });
    }
    if (action === 'leave') {
      const result = await mutateRoom(store, code, room => {
        getPlayer(room, id);
        room.players = room.players.filter(p => p.id !== id);
        if (room.players.length === 0) return { room: null };
        if (room.hostId === id) room.hostId = room.players[0].id;
        delete room.challenges[id];
        return { room: publicRoom(room) };
      });
      if (result.room === null) { await store.delete(roomKey(code)); return json({ room: null }); }
      return json(result);
    }
    const room = await mutateRoom(store, code, current => {
      const player = getPlayer(current, id);
      if (action === 'ready') {
        if (current.phase !== 'lobby') throw Object.assign(new Error('The game has already started.'), { status: 409 });
        player.ready = true; return { room: publicRoom(current) };
      }
      if (action === 'start') {
        requireHost(current, id);
        if (current.phase !== 'lobby') throw Object.assign(new Error('This game has already started.'), { status: 409 });
        if (current.players.length < 2) throw Object.assign(new Error('At least two players are required to start.'), { status: 409 });
        if (current.players.length > MAX_PLAYERS) throw Object.assign(new Error('Room capacity exceeded.'), { status: 409 });
        if (!current.players.every(p => p.ready)) throw Object.assign(new Error('Every player must ready up before the host launches the arena.'), { status: 409 });
        current.round = 1; beginRound(current); return { room: publicRoom(current) };
      }
      if (action === 'answer') {
        if (current.phase !== 'answer') throw Object.assign(new Error('The answer window is closed.'), { status: 409 });
        if (player.lastAnswerRound === current.round) throw Object.assign(new Error('You already answered this round.'), { status: 409 });
        const challenge = current.challenges?.[id];
        const choice = Number(body.answerIndex);
        if (!challenge || !Number.isInteger(choice) || choice < 0 || choice >= challenge.options.length) throw Object.assign(new Error('Invalid answer selection.'), { status: 400 });
        const responseMs = Math.max(0, Math.min(15000, 15000 - Math.max(0, current.phaseEndsAt - now())));
        const correct = choice === challenge.answerIndex;
        const firstCorrect = correct && !current.roundResults.some(r => r.correct);
        const points = correct ? 100 + (firstCorrect ? 25 : 0) + (responseMs <= 3000 ? 10 : 0) : 0;
        player.lastAnswerRound = current.round; player.answers += 1; player.totalResponseMs += responseMs;
        if (correct) { player.correct += 1; player.score += points; player.energy = Math.min(3, player.energy + 1); }
        current.roundResults.push({ playerId: id, correct, points, responseMs });
        if (current.players.every(p => p.lastAnswerRound === current.round)) { current.phase = 'results'; current.phaseEndsAt = now() + 60000; }
        return { room: publicRoom(current), message: correct ? `Correct! +${points} points.` : 'Not quite. Save your energy for the next round.' };
      }
      if (action === 'ability') {
        if (current.phase !== 'answer') throw Object.assign(new Error('Abilities are only available during the answer phase.'), { status: 409 });
        if (player.lastAnswerRound === current.round) throw Object.assign(new Error('Use your ability before submitting your answer.'), { status: 409 });
        if (player.energy < 1) throw Object.assign(new Error('You need at least one energy charge.'), { status: 409 });
        const ability = String(body.ability || '');
        if (!['shield','pulse'].includes(ability)) throw Object.assign(new Error('Unknown ability.'), { status: 400 });
        const moveKey = `${current.round}:${id}`;
        if (current.usedMoves.includes(moveKey)) throw Object.assign(new Error('You have already used an ability this round.'), { status: 409 });
        player.energy -= 1; current.usedMoves.push(moveKey);
        if (ability === 'shield') { player.shielded = true; return { room: publicRoom(current), message: 'Shield activated. It blocks the next Pulse targeting you.' }; }
        const rivals = current.players.filter(p => p.id !== id);
        if (!rivals.length) throw Object.assign(new Error('No rival to target.'), { status: 409 });
        const targetId = String(body.targetId || '');
        const target = rivals.find(p => p.id === targetId) || [...rivals].sort((a,b)=>b.score-a.score)[0];
        if (target.shielded) { target.shielded = false; return { room: publicRoom(current), message: `${target.name}'s Shield blocked your Pulse.` }; }
        target.pulsePenalty += 1;
        return { room: publicRoom(current), message: `Pulse locked on ${target.name}. Their next sequence will be scrambled.` };
      }
      if (action === 'next') {
        requireHost(current, id);
        if (current.phase !== 'results') throw Object.assign(new Error('Wait for the round results first.'), { status: 409 });
        if (current.round >= current.maxRounds) { current.phase = 'finished'; current.phaseEndsAt = 0; current.winnerId = [...current.players].sort((a,b)=>b.score-a.score || b.correct-a.correct || a.totalResponseMs-b.totalResponseMs)[0]?.id; return { room: publicRoom(current) }; }
        current.round += 1; beginRound(current); return { room: publicRoom(current) };
      }
      if (action === 'rematch') {
        requireHost(current, id);
        if (current.phase !== 'finished') throw Object.assign(new Error('The match is not finished yet.'), { status: 409 });
        current.phase = 'lobby'; current.round = 0; current.phaseEndsAt = 0; current.winnerId = undefined; current.sequence = []; current.options = []; current.answerIndex = 0; current.challenges = {}; current.roundResults = []; current.usedMoves = [];
        for (const p of current.players) { p.score=0;p.energy=0;p.ready=p.id===current.hostId;p.shielded=false;p.pulsePenalty=0;p.answers=0;p.correct=0;p.totalResponseMs=0;p.lastAnswerRound=0; }
        return { room: publicRoom(current) };
      }
      throw Object.assign(new Error('Unknown game action.'), { status: 400 });
    });
    return json(room);
  } catch (error) {
    const status = Number(error?.status) || 500;
    return fail(status === 500 ? 'The game service hit an unexpected error. Please retry.' : error.message, status);
  }
};
