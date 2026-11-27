'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../game-logic.js');
const L = require('../link.js');

function freshGame() { return G.newGame(G.defaultSettings(), () => .999999); }

function ringing() {
  let game = G.selectCase(freshGame(), 1);
  for (let n = 2; game.phase === 'open'; n++) game = G.finishReveal(G.selectCase(game, n));
  return game;
}

test('a saved v1 call waits for Answer and Hang up, preserving its existing offer', () => {
  const call = JSON.parse(JSON.stringify(ringing()));
  const line = G.answerCall(call);
  const offer = G.hangUp(line);
  assert.equal(line.phase, 'line');
  assert.deepEqual(offer, G.showOffer(call));
  assert.equal(G.answerCall(line), line);
  assert.equal(G.hangUp(call), call);
  assert.equal(G.hangUp(offer), offer);
});

test('phoneUrl builds a host-phone link from the current page location', () => {
  assert.equal(
    L.phoneUrl('https://hmarkus32.github.io/deal-or-no-deal/', 'k7qx'),
    'https://hmarkus32.github.io/deal-or-no-deal/phone.html?room=K7QX'
  );
  assert.equal(
    L.phoneUrl('https://hmarkus32.github.io/deal-or-no-deal/index.html', 'K7QX'),
    'https://hmarkus32.github.io/deal-or-no-deal/phone.html?room=K7QX'
  );
  assert.equal(
    L.phoneUrl('https://raw.githack.com/hmarkus32/deal-or-no-deal/codex/phone-qr/index.html', 'ab23'),
    'https://raw.githack.com/hmarkus32/deal-or-no-deal/codex/phone-qr/phone.html?room=AB23'
  );
  assert.equal(L.phoneUrl('https://example.com/game/', 'O234'), null);
  assert.equal(L.phoneUrl('https://example.com/game/', null), null);
});

test('four readable characters map to a normalized stage peer id', () => {
  for (let i = 0; i < 200; i++) {
    const code = L.roomCode();
    assert.match(code, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    assert.equal(L.peerId(code.toLowerCase()), 'hmarkus32-dond-' + code.toLowerCase());
  }
  assert.equal(L.normalizeCode(' k7qx '), 'K7QX');
  for (const invalid of ['O234','1ABC','AB0D','L234','I234','!234','ABC','ABCDE',null,1234]) {
    assert.equal(L.peerId(invalid), null);
  }
});

test('snapshots allowlist revealed values and withhold the banker offer until answered', () => {
  function check(game, numbers, hasOffer) {
    const snap = L.snapshot(game, 12);
    assert.deepEqual(snap.opened, numbers.map(n => ({n, amount:game.cases[n - 1]})));
    assert.equal(Object.hasOwn(snap, 'offer'), hasOffer);
    if (hasOffer) assert.equal(snap.offer, game.offers.at(-1).amount);
    for (const field of ['cases','amounts','offers']) assert.ok(!(field in snap));
    if (snap.result) assert.deepEqual(Object.keys(snap.result).sort(), ['other','type','winnings']);
    return snap;
  }
  check(freshGame(), [], false);
  const call = ringing();
  check(call, call.opened, false);
  const line = G.answerCall(call);
  check(line, call.opened, true);
  const offer = G.hangUp(line);
  check(offer, call.opened, true);
  const next = G.decideOffer(offer, false);
  check(next, call.opened, false);
  const deal = G.decideOffer(offer, true);
  check(deal, [...deal.opened, deal.chosen], true);
  const last = {...call, phase:'swap', opened:Array.from({length:24}, (_, i) => i + 2)};
  const final = G.finishSwap(last, true);
  const snap = check(final, [...last.opened,26], true);
  assert.ok(!('otherAmount' in snap.result));
  check(G.revealOtherCase(final), [...last.opened,26,1], true);
  assert.equal(L.snapshot(deal, 13, {setup:true}).phase, 'setup');
  assert.equal(L.snapshot(null, 14).phase, 'title');
});

test('stale revisions, wrong phases, unknown actions and malformed commands leave the stage unchanged', () => {
  const game = freshGame();
  const pick = {type:'cmd', phase:'pick', rev:7, action:'selectCase', n:2};
  for (const cmd of [null, [], 'deal', {}, {...pick, rev:6}, {...pick, rev:'7'}, {...pick, rev:NaN},
    {...pick, phase:'open'}, {...pick, type:'snapshot'}, {...pick, action:'playAgain'}, {...pick, action:'toString'},
    {...pick, action:'hangUp'}, {...pick, n:'2'}, {...pick, n:-1}, {...pick, n:3.5}, {...pick, n:27}]) {
    assert.equal(L.applyCommand(game, cmd, 7), game);
  }
  assert.equal(L.applyCommand(null, pick, 7), null);
});

function wire() {
  let stageOpen, stageMessage, phoneMessage, online = false;
  return {
    stage:{
      onOpen(fn) { stageOpen = fn; }, onMessage(fn) { stageMessage = fn; },
      send(msg) { if (online) phoneMessage(structuredClone(msg)); }
    },
    phone:{
      connect(fn) { phoneMessage = fn; online = true; stageOpen(); },
      disconnect() { online = false; },
      send(msg) { if (online) stageMessage(structuredClone(msg)); }
    }
  };
}

for (const path of ['deal','keep','swap']) test('fake stage and phone play to result via ' + path + ' with mid-call resync', () => {
  let game = freshGame(), rev = 1, phoneState, publish;
  const {stage, phone} = wire();
  publish = L.serve(stage, () => L.snapshot(game, rev), cmd => {
    const next = L.applyCommand(game, cmd, rev);
    if (next === game) return false;
    game = next;
    rev++;
    publish();
    return true;
  });
  const connect = () => phone.connect(snap => { phoneState = snap; });
  const tap = (action, n) => {
    const cmd = {type:'cmd', phase:phoneState.phase, rev:phoneState.rev, action, n};
    const before = rev;
    phone.send(cmd);
    assert.equal(rev, before + 1);
    phone.send(cmd); // The data channel can deliver a repeated tap after the stage has moved on.
    assert.equal(rev, before + 1);
    assert.equal(phoneState.phase, game.phase);
  };
  connect();
  tap('selectCase', 1);
  for (let n = 2; game.phase === 'open';) {
    tap('selectCase', n++);
    assert.equal(phoneState.phase, 'reveal');
    tap('continue');
    if (phoneState.phase === 'open') continue;
    assert.equal(phoneState.phase, 'call');
    tap('answer');
    assert.equal(phoneState.phase, 'line');
    const answered = phoneState;
    phone.disconnect();
    phoneState = null;
    phone.send({type:'cmd', phase:'line', rev, action:'hangUp'});
    connect();
    assert.deepEqual(phoneState, answered);
    tap('hangUp');
    assert.equal(phoneState.phase, 'offer');
    tap(path === 'deal' ? 'deal' : 'noDeal');
  }
  if (path !== 'deal') {
    assert.equal(phoneState.phase, 'swap');
    tap(path);
    assert.equal(game.chosen, path === 'swap' ? 26 : 1);
    tap('openOther');
    assert.equal(phoneState.phase, 'otherReveal');
  }
  tap('showResult');
  assert.equal(phoneState.phase, 'result');
  assert.equal(phoneState.result.type, path);
  assert.equal(phoneState.result.winnings, game.result.winnings);
});
