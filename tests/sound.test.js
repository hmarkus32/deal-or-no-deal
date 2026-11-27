'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const soundEngine = require('../sound.js');

function audioHarness() {
  const nodes = [];
  const context = {
    currentTime:2, state:'running', destination:{},
    createOscillator() {
      const node = {frequency:param(), connect(to) { return to; }, disconnect() {},
        start(time) { this.started = time; }, stop(time) { this.stops.push(time); }, stops:[]};
      nodes.push(node);
      return node;
    },
    createGain() { return {gain:param(), connect(to) { return to; }, disconnect() {}}; }
  };
  function param() {
    return {setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}};
  }
  let muted = false;
  return {context, nodes, mute() { muted = true; }, sound:soundEngine(() => muted, () => context)};
}

test('every cue waits for unlock, schedules audible length, and respects mute', () => {
  const {sound, nodes, mute} = audioHarness();
  const kinds = ['ring', 'deal', 'no-deal', 'low', 'high'];
  for (const kind of kinds) sound.play(kind);
  assert.equal(nodes.length, 0);
  sound.unlock();
  for (const kind of kinds) {
    const before = nodes.length;
    sound.play(kind);
    assert.ok(nodes.length > before);
    for (const node of nodes.slice(before)) assert.ok(node.stops[0] - node.started > .2);
  }
  mute();
  sound.silence();
  const count = nodes.length;
  for (const kind of kinds) sound.play(kind);
  assert.equal(nodes.length, count);
  for (const node of nodes) assert.ok(node.stops[1] < node.stops[0]);
});

test('ending the ring leaves the case-open cue playing, even if old nodes throw on cleanup', () => {
  const {sound, nodes} = audioHarness();
  sound.unlock();
  sound.play('ring');
  const ring = [...nodes];
  sound.play('low');
  ring[0].stop = ring[0].disconnect = () => { throw Error('InvalidStateError'); };
  sound.silence('ring');
  ring.forEach(node => node.onended());
  assert.ok(ring.slice(1).every(node => node.stops.length === 2));
  assert.ok(nodes.slice(ring.length).every(node => node.stops.length === 1));
});

test('context creation, resume and cue scheduling failures stay inside the audio layer', async () => {
  const fail = () => { throw Error('InvalidStateError'); };
  soundEngine(() => false, fail).unlock();
  const {sound, context} = audioHarness();
  context.state = 'interrupted';
  context.resume = fail;
  sound.unlock();
  context.resume = () => Promise.reject(Error('NotAllowedError'));
  sound.unlock();
  await Promise.resolve();
  context.state = 'running';
  context.createGain = fail;
  sound.play('deal');
  sound.silence();
});
