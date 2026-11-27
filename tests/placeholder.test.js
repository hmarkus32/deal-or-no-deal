// Placeholder so CI is green before the game exists. Replace with real game-logic tests (see docs/briefs/01-game.md).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('index.html exists', () => {
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'index.html')));
});
