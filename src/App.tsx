import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowRight, AudioLines, Check, ChevronRight, CircleHelp, Copy, Crown, Flame, Gem, LockKeyhole, LogOut, Radio, RotateCcw, Shield, Sparkles, Swords, Timer, Trophy, Users, Zap } from 'lucide-react';
import type { GameRoom } from './game';

type ApiResult = { room?: GameRoom; playerId?: string; error?: string; message?: string };
const PLAYER_KEY = 'echo-shift-player';
const savedPlayer = () => { try { return JSON.parse(sessionStorage.getItem(PLAYER_KEY) || 'null') as {id:string;name:string;code:string}|null; } catch { return null; } };

async function api(action: string, payload: Record<string, unknown> = {}): Promise<ApiResult> {
  const res = await fetch('/.netlify/functions/game', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({action, ...payload}) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'The game service could not complete that action.');
  return data;
}

export default function App() {
  const [name, setName] = useState(savedPlayer()?.name || '');
  const [roomCode, setRoomCode] = useState('');
  const [room, setRoom] = useState<GameRoom|null>(null);
  const [playerId, setPlayerId] = useState(savedPlayer()?.id || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  const [answer, setAnswer] = useState<number|null>(null);
  const [showRules, setShowRules] = useState(false);
  const pollRef = useRef<number | null>(null);
  const me = room?.players.find(p => p.id === playerId);
  const challenge = me && room ? room.challenges?.[me.id] : undefined;
  const ranked = useMemo(() => [...(room?.players || [])].sort((a,b)=>b.score-a.score || b.correct-a.correct || a.totalResponseMs-b.totalResponseMs), [room?.players]);
  const remaining = room ? Math.max(0, Math.ceil((room.phaseEndsAt-now)/1000)) : 0;

  const refresh = useCallback(async (code: string, id: string) => {
    try {
      const result = await api('state', {code, playerId:id});
      if (result.room) { setRoom(result.room); setError(''); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not refresh room.'); }
  }, []);

  useEffect(() => {
    const saved = savedPlayer();
    if (saved?.code && saved?.id) {
      setName(saved.name); setRoomCode(saved.code); setPlayerId(saved.id);
      void refresh(saved.code, saved.id);
    }
  }, [refresh]);

  useEffect(() => {
    if (!room || !playerId) return;
    const code = room.code;
    pollRef.current = window.setInterval(() => void refresh(code, playerId), 1100);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [room?.code, playerId, refresh]);
  useEffect(() => { const t = window.setInterval(()=>setNow(Date.now()), 200); return ()=>window.clearInterval(t); }, []);
  useEffect(() => { if (room?.phase === 'answer') setAnswer(null); }, [room?.round, room?.phase]);

  async function act(action: string, payload: Record<string,unknown> = {}) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api(action, payload);
      if (result.room) setRoom(result.room);
      if (result.playerId) setPlayerId(result.playerId);
      if (result.room && result.playerId) sessionStorage.setItem(PLAYER_KEY, JSON.stringify({id:result.playerId,name,code:result.room.code}));
      if (result.message) setNotice(result.message);
      return result;
    } catch(e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); return null; }
    finally { setBusy(false); }
  }
  async function createRoom() { if (!name.trim()) {setError('Enter a display name first.');return;} const r = await act('create',{name:name.trim()}); if(r?.room && r.playerId) sessionStorage.setItem(PLAYER_KEY,JSON.stringify({id:r.playerId,name:name.trim(),code:r.room.code})); }
  async function joinRoom() { if (!name.trim() || roomCode.trim().length!==6) {setError('Enter your name and a six-character room code.');return;} const r=await act('join',{name:name.trim(),code:roomCode.trim().toUpperCase()}); if(r?.room && r.playerId) sessionStorage.setItem(PLAYER_KEY,JSON.stringify({id:r.playerId,name:name.trim(),code:r.room.code})); }
  async function leaveRoom() { try { if(room) await act('leave',{code:room.code,playerId}); } finally {setRoom(null);setPlayerId('');setAnswer(null);sessionStorage.removeItem(PLAYER_KEY);} }
  async function copyInvite() { if(!room)return; const url = `${window.location.origin}/?room=${room.code}`; try {await navigator.clipboard.writeText(url);setNotice('Invite link copied!');} catch {setNotice(`Room code: ${room.code}`);} }
  useEffect(()=>{const query=new URLSearchParams(window.location.search).get('room');if(query)setRoomCode(query.toUpperCase());},[]);

  return <div className="app-shell"><div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <header className="topbar"><a className="brand" href="#home" onClick={e=>e.preventDefault()}><span className="brand-mark"><AudioLines size={23}/></span><span>ECHO<span className="brand-accent">SHIFT</span><small>REAL-TIME STRATEGY ARENA</small></span></a><div className="top-actions"><span className="online-pill"><i/> SYSTEM ONLINE</span><button className="icon-button" title="How to play" onClick={()=>setShowRules(v=>!v)}><CircleHelp size={18}/></button></div></header>
    <main className="main-content">
      {!room ? <section className="hero-grid" id="home"><div className="hero-copy"><div className="eyebrow"><Sparkles size={14}/> THE NEXT-GEN PARTY ARENA</div><h1>Think fast.<br/><span>Shift the game.</span></h1><p className="hero-description">Decode the signal. Outsmart your rivals. Every round changes the rhythm — only the sharpest mind owns the arena.</p><div className="hero-stats"><div><strong>02—08</strong><span>PLAYERS</span></div><div><strong>05</strong><span>ROUNDS</span></div><div><strong>∞</strong><span>REMATCHES</span></div></div><div className="hero-art"><div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="core-symbol">✦</div><div className="float-symbol fs-1">◆</div><div className="float-symbol fs-2">◉</div><div className="float-symbol fs-3">▲</div><div className="art-caption"><span className="pulse-dot"/> SIGNAL DETECTED <b>01 / 05</b></div></div></div>
        <div className="entry-card"><div className="card-topline"><span>PLAYER ACCESS</span><span className="lock-label"><LockKeyhole size={12}/> ENCRYPTED ROOM</span></div><h2>Enter the arena</h2><p className="muted">Create a new lobby or jump into a friend's game.</p><label className="field-label" htmlFor="player-name">YOUR CALLSIGN</label><div className="input-wrap"><Users size={17}/><input id="player-name" value={name} onChange={e=>setName(e.target.value.slice(0,18))} placeholder="e.g. NeonFox" maxLength={18} onKeyDown={e=>{if(e.key==='Enter')void createRoom()}}/><span>{name.length}/18</span></div><button className="primary-button" disabled={busy} onClick={()=>void createRoom()}>{busy?'Creating room…':'Create a room'}<ArrowRight size={17}/></button><div className="separator"><span/> OR JOIN A SQUAD <span/></div><label className="field-label" htmlFor="room-code">ROOM CODE</label><div className="join-row"><input id="room-code" className="code-input" value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6))} placeholder="A1B2C3" maxLength={6} onKeyDown={e=>{if(e.key==='Enter')void joinRoom()}}/><button className="secondary-button" disabled={busy} onClick={()=>void joinRoom()}>Join <ChevronRight size={17}/></button></div><div className="card-foot"><span><LockKeyhole size={13}/> No account required</span><span><Radio size={13}/> Live sync</span></div>{error&&<div className="error-message">{error}</div>}{notice&&<div className="notice-message">{notice}</div>}</div>
        <div className="feature-strip"><div><span className="feature-icon cyan"><Zap size={18}/></span><div><b>Real-time rivalry</b><small>Every move, live</small></div></div><div><span className="feature-icon violet"><Shield size={18}/></span><div><b>Play your strategy</b><small>Shield up. Pulse out.</small></div></div><div><span className="feature-icon amber"><Trophy size={18}/></span><div><b>Own the leaderboard</b><small>Five rounds. One winner.</small></div></div></div>
      </section> : <section className="game-layout"><div className="game-main"><div className="game-heading"><div><div className="eyebrow"><span className="pulse-dot"/> LIVE ARENA / {room.code}</div><h1>{room.phase==='lobby'?'Squad lobby':room.phase==='finished'?'Arena champion':room.phase==='results'?'Round debrief':room.phase==='memorize'?'Lock in the signal':'Decode the signal'}</h1><p className="muted">{room.phase==='lobby'?'Rally your squad. The host starts when everyone is ready.':room.phase==='finished'?'The signal has settled. See who ruled the arena.':room.phase==='results'?'Points are counted. Prepare for the next shift.':room.phase==='memorize'?'Memorize the sequence before it disappears.':'Pick the missing signal before the clock runs out.'}</p></div><button className="icon-button leave-button" onClick={()=>void leaveRoom()} title="Leave room"><LogOut size={17}/></button></div>
          {room.phase==='lobby' ? <div className="lobby-panel panel"><div className="room-code-box"><div><small>YOUR ROOM CODE</small><strong>{room.code}</strong><span>Share this code with your squad</span></div><button className="secondary-button" onClick={()=>void copyInvite()}><Copy size={15}/> Invite</button></div><div className="panel-divider"/><div className="players-title"><span>SQUAD MEMBERS <b>{room.players.length}/8</b></span><span className="live-label"><i/> LIVE</span></div><div className="lobby-players">{room.players.map((p,i)=><div className="lobby-player" key={p.id}><Avatar name={p.name} index={i}/><div className="player-info"><b>{p.name}{p.id===room.hostId&&<span className="host-tag">HOST</span>}</b><small>{p.id===room.hostId?'Arena commander':'Squad member'}</small></div><span className={p.ready?'ready-tag':'waiting-tag'}>{p.ready?'READY':'WAITING'}</span></div>)}{Array.from({length:Math.max(0,2-room.players.length)},(_,i)=><div className="lobby-player ghost-player" key={`empty-${i}`}><div className="avatar avatar-empty">+</div><div className="player-info"><b>Awaiting player</b><small>Invite a friend to join</small></div><span className="waiting-tag">OPEN SLOT</span></div>)}</div><div className="lobby-actions">{playerId===room.hostId?<button className="primary-button" disabled={busy||room.players.length<2||room.players.some(p=>!p.ready)} onClick={()=>void act('start',{code:room.code,playerId})}>Launch arena <ArrowRight size={17}/></button>:<button className="primary-button" disabled={busy||!!me?.ready} onClick={()=>void act('ready',{code:room.code,playerId})}>{me?.ready?'You are ready':'Ready up'} <Check size={17}/></button>}<p>{room.players.length<2?'Need at least 2 players to start.':playerId===room.hostId?'All systems go when your squad is ready.':'Waiting for the host to launch.'}</p></div></div>
          : room.phase==='finished' ? <div className="winner-panel panel"><div className="winner-glow"><Crown size={44}/></div><span className="eyebrow">THE SIGNAL CHOSE</span><h2>{ranked[0]?.name||'Unknown player'}</h2><p className="muted">Arena champion with <b>{ranked[0]?.score||0} points</b></p><div className="final-rankings">{ranked.map((p,i)=><div className="rank-row" key={p.id}><span className="rank-number">{String(i+1).padStart(2,'0')}</span><Avatar name={p.name} index={i}/><b>{p.name}</b><strong>{p.score}<small> PTS</small></strong></div>)}</div>{playerId===room.hostId&&<button className="primary-button" onClick={()=>void act('rematch',{code:room.code,playerId})}><RotateCcw size={17}/> Run it back</button>}</div>
          : <div className="challenge-panel panel"><div className="challenge-meta"><span className="round-chip">ROUND {room.round} <i/> {room.maxRounds}</span><div className={`timer ${remaining<=5?'timer-danger':''}`}><Timer size={16}/><b>00:{String(remaining).padStart(2,'0')}</b></div></div><div className="progress-track"><div style={{width:`${Math.max(0,Math.min(100,remaining/(room.phase==='memorize'?7:15)*100))}%`}}/></div>
            {room.phase==='memorize'?<><div className="challenge-instruction"><span className="instruction-icon"><AudioLines size={20}/></span><div><b>MEMORIZE THE SEQUENCE</b><small>Remember the final symbol — you'll need it.</small></div></div><div className="sequence-display">{(challenge?.sequence || room.sequence).map((s,i)=><div className="sequence-symbol" key={`${s}-${i}`} style={{animationDelay:`${i*70}ms`}}>{s}</div>)}</div><div className="waiting-note"><span className="pulse-dot"/> Signal fades in <b>{remaining}s</b></div></>
            :room.phase==='answer'?<><div className="challenge-instruction"><span className="instruction-icon violet-bg"><Gem size={20}/></span><div><b>WHAT WAS THE LAST SYMBOL?</b><small>Trust your memory. Speed earns a small bonus.</small></div></div><div className="answer-grid">{(challenge?.options || room.options).map((s,i)=><button key={`${s}-${i}`} disabled={!!me?.lastAnswerRound&&me.lastAnswerRound===room.round||answer!==null} className={`answer-option ${answer===i?'answer-selected':''}`} onClick={()=>{setAnswer(i);void act('answer',{code:room.code,playerId,answerIndex:i,clientResponseMs:Math.max(0,15000-remaining*1000)});}}><span className="option-key">{['A','B','C','D'][i]}</span><span className="option-symbol">{s}</span>{answer===i&&<Check size={17} className="answer-check"/>}</button>)}</div><div className="answer-footer"><span><Users size={14}/> {room.players.filter(p=>p.lastAnswerRound===room.round).length}/{room.players.length} answered</span><span><Flame size={14}/> +25 first-correct bonus</span></div></>
            :<><div className="result-banner"><div className="result-icon"><Activity size={23}/></div><div><b>ROUND {room.round} RESULTS</b><small>{room.roundResults.length} responses recorded</small></div></div><div className="round-result-list">{room.roundResults.length?room.roundResults.map((r,i)=>{const p=room.players.find(x=>x.id===r.playerId);return <div className="round-result-row" key={`${r.playerId}-${i}`}><Avatar name={p?.name||'?'} index={i}/><span>{p?.name||'Player'}</span><span className={r.correct?'correct-label':'wrong-label'}>{r.correct?'+':'±'}{r.points} pts</span></div>}):<p className="muted">No answers this round.</p>}</div>{playerId===room.hostId?<button className="primary-button" disabled={busy} onClick={()=>void act('next',{code:room.code,playerId})}>{room.round>=room.maxRounds?'Reveal champion':'Next round'} <ArrowRight size={17}/></button>:<div className="waiting-note"><span className="pulse-dot"/> Waiting for host to continue…</div>}</>}
            {room.phase!=='results'&&<div className="ability-row"><div className="ability-label"><Swords size={16}/><span>TACTICAL LOADOUT <small>Spend energy to shift the odds</small></span></div><div className="ability-buttons"><button className="ability-button" disabled={room.phase!=='answer'||!me||me.energy<1||busy} onClick={()=>void act('ability',{code:room.code,playerId,ability:'shield'})}><Shield size={15}/><span>Shield</span><b>{me?.energy||0}</b></button><button className="ability-button" disabled={room.phase!=='answer'||!me||me.energy<1||busy} onClick={()=>void act('ability',{code:room.code,playerId,ability:'pulse'})}><Zap size={15}/><span>Pulse</span><b>{me?.energy||0}</b></button></div></div>}
          </div>}
          {error&&<div className="error-message">{error}</div>}{notice&&<div className="notice-message">{notice}</div>}
        </div><aside className="sidebar"><div className="side-panel panel"><div className="side-heading"><span><Trophy size={16}/> LEADERBOARD</span><span className="live-label"><i/> LIVE</span></div><div className="leaderboard">{ranked.map((p,i)=><div className={`leader-row ${p.id===playerId?'my-row':''}`} key={p.id}><span className={`leader-rank rank-${i+1}`}>{i===0?<Crown size={15}/>:String(i+1).padStart(2,'0')}</span><Avatar name={p.name} index={i}/><div className="leader-person"><b>{p.name}{p.id===playerId&&<small>YOU</small>}</b><span><span className="energy-dots">{'◆'.repeat(p.energy)}<i>{'◇'.repeat(3-p.energy)}</i></span> {p.energy}/3 energy</span></div><strong>{p.score}</strong></div>)}</div><div className="score-legend"><span><i className="legend-cyan"/> You</span><span><i className="legend-violet"/> Rivals</span></div></div><div className="side-panel panel"><div className="side-heading"><span><Zap size={16}/> ARENA INTEL</span></div><div className="intel-item"><span className="intel-icon"><Timer size={16}/></span><div><b>Balanced tempo</b><small>7s signal · 15s answer window</small></div></div><div className="intel-item"><span className="intel-icon"><Shield size={16}/></span><div><b>Shield</b><small>Block the next incoming Pulse</small></div></div><div className="intel-item"><span className="intel-icon"><Swords size={16}/></span><div><b>Pulse</b><small>Scramble a rival's next challenge</small></div></div><div className="intel-tip"><Sparkles size={15}/><p>Stay sharp. A correct answer earns <b>100 points</b> — the first correct response earns +25 more.</p></div></div><button className="leave-room-link" onClick={()=>void leaveRoom()}><LogOut size={14}/> Leave this arena</button></aside></section>}
      {showRules&&<div className="rules-overlay" role="dialog" aria-modal="true"><div className="rules-modal panel"><button className="icon-button modal-close" onClick={()=>setShowRules(false)}>×</button><div className="eyebrow"><Sparkles size={13}/> FIELD MANUAL</div><h2>How to play ECHO SHIFT</h2><ol><li><b>Memorize:</b> Study the symbol sequence for 7 seconds.</li><li><b>Decode:</b> Select the final symbol within 15 seconds.</li><li><b>Score:</b> Correct = 100 points; first correct = +25; fast correct (3s or less) = +10.</li><li><b>Charge:</b> Correct answers earn 1 energy, up to 3.</li><li><b>Shift:</b> Spend 1 energy on Shield or Pulse during answer time.</li><li><b>Win:</b> Highest score after five rounds wins. Ties break by correct answers, then fastest cumulative response time.</li></ol><p className="muted">Shield blocks the next Pulse. Pulse scrambles the target's next sequence. A player can submit only once per round.</p><button className="primary-button" onClick={()=>setShowRules(false)}>Got it <Check size={17}/></button></div></div>}
    </main><footer className="footer"><span>© 2026 ECHO SHIFT <i/> BUILT FOR THE BOLD</span><span><span className="pulse-dot"/> MULTIPLAYER SERVICE READY</span></footer>
  </div>;
}
function Avatar({name,index}:{name:string;index:number}) { const colors=['avatar-cyan','avatar-violet','avatar-amber','avatar-pink','avatar-green','avatar-blue','avatar-orange','avatar-teal']; return <div className={`avatar ${colors[index%colors.length]}`}>{name.trim().charAt(0).toUpperCase()||'?'}</div>; }
