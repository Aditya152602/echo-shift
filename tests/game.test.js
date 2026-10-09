import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/game.ts', import.meta.url), 'utf8');
function loadFunctions() {
  // Small source-level contract checks keep the package tests dependency-free.
  assert.match(source, /export function makeSequence/);
  assert.match(source, /export function scoreAnswer/);
  assert.match(source, /export function getWinner/);
}
test('game rules module exports core game helpers', loadFunctions);
test('five-round configuration and ability endpoints are present', async () => {
  const backend = await readFile(new URL('../netlify/functions/game.mjs', import.meta.url), 'utf8');
  assert.match(backend, /const MAX_ROUNDS = 5/);
  assert.match(backend, /action === 'ability'/);
  assert.match(backend, /action === 'answer'/);
  assert.match(backend, /onlyIfMatch/);
  assert.match(backend, /consistency: 'strong'/);
});
test('Netlify deployment config publishes Vite dist and the game function', async () => {
  const config = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
  assert.match(config, /publish = "dist"/);
  assert.match(config, /functions = "netlify\/functions"/);
  assert.match(config, /\.netlify\/functions\/:splat/);
});
