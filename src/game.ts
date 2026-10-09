export type Phase = 'lobby' | 'memorize' | 'answer' | 'results' | 'finished';
export type Ability = 'shield' | 'pulse';
export type Player = { id: string; name: string; score: number; energy: number; ready: boolean; connectedAt: number; shielded: boolean; pulsePenalty: number; answers: number; correct: number; totalResponseMs: number; lastAnswerRound: number };
export type Challenge = { sequence: string[]; options: string[]; answerIndex?: number };
export type GameRoom = { challenges?: Record<string, Challenge>; code: string; hostId: string; phase: Phase; round: number; maxRounds: 5; createdAt: number; phaseEndsAt: number; sequence: string[]; options: string[]; answerIndex: number; players: Player[]; usedMoves: string[]; roundResults: {playerId:string; correct:boolean; points:number; responseMs:number}[]; winnerId?: string; revision: number };
export const SYMBOLS = ['◆','●','▲','■','✦','⬟','✚','◉'];
export function makeCode() { return Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X'); }
export function makeSequence(round: number, random = Math.random): { sequence: string[]; options: string[]; answerIndex: number } {
  const length = Math.min(3 + round, 8);
  const sequence = Array.from({length}, () => SYMBOLS[Math.floor(random() * SYMBOLS.length)]);
  const answerIndex = Math.floor(random() * 4);
  const correct = sequence[(round + length - 1) % length];
  const options = Array.from({length:4}, (_, i) => i === answerIndex ? correct : SYMBOLS[(SYMBOLS.indexOf(correct) + i + 1 + Math.floor(random()*6)) % SYMBOLS.length]);
  // Ensure each distractor differs from the correct answer and from the other options.
  const used = new Set([correct]);
  for (let i=0;i<options.length;i++) {
    if (i === answerIndex) continue;
    let candidate = options[i];
    while (used.has(candidate)) candidate = SYMBOLS[(SYMBOLS.indexOf(candidate)+1)%SYMBOLS.length];
    options[i] = candidate; used.add(candidate);
  }
  return {sequence, options, answerIndex};
}
export function scoreAnswer(correct: boolean, responseMs: number, firstCorrect: boolean) {
  if (!correct) return 0;
  return 100 + (firstCorrect ? 25 : 0) + (responseMs <= 3000 ? 10 : 0);
}
export function getWinner(players: Player[]): Player | undefined {
  return [...players].sort((a,b) => b.score-a.score || b.correct-a.correct || a.totalResponseMs-b.totalResponseMs)[0];
}
