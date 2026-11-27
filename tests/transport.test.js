'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const L = require('../link.js');

class Channel extends EventEmitter {
  sent = [];
  open = false;
  accept() { this.open = true; this.emit('open'); }
  send(msg) { this.sent.push(msg); }
  close() { this.open = false; this.emit('close'); }
}

async function harness(t, options) {
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date'], now:1000});
  const peers = [], statuses = [], codes = [];
  const visibility = new EventTarget(), events = new EventTarget();
  global.document = visibility;
  global.window = events;
  class Peer extends EventEmitter {
    constructor(id) { super(); this.id = id; peers.push(this); }
    connect(id) { this.target = id; this.channel = new Channel(); return this.channel; }
    destroy() { this.channel?.close(); this.emit('close'); }
  }
  const transport = L.transport({role:'stage', code:'K7QX', getPeer:() => Peer,
    onCode:code => codes.push(code), onStatus:(status, detail) => statuses.push([status,detail]), ...options});
  t.after(() => { transport.stop(); delete global.document; delete global.window; });
  await Promise.resolve();
  return {transport, peers, codes, statuses, events, visibility,
    async tick(ms) { t.mock.timers.tick(ms); await Promise.resolve(); }};
}

test('the stage replaces an opened phone, ignores its old commands and drops a silent channel', async t => {
  const {transport, peers:[peer], statuses, tick} = await harness(t);
  const received = [];
  transport.onMessage(msg => received.push(msg));
  peer.emit('open');
  const old = new Channel(), current = new Channel();
  peer.emit('connection', old); old.accept();
  peer.emit('connection', current);
  transport.send('still on old phone');
  current.accept();
  old.emit('data', 'retired');
  current.emit('data', 'current');
  assert.deepEqual(received, ['current']);
  assert.deepEqual(old.sent, ['still on old phone', {type:'replaced'}]);
  await tick(5000);
  assert.deepEqual(current.sent, [{type:'ping'}]);
  current.emit('data', {type:'pong'});
  await tick(10000);
  assert.equal(statuses.at(-1)[0], 'linked');
  await tick(5000);
  assert.equal(statuses.at(-1)[0], 'lost');
  assert.equal(current.open, false);
});

test('a new-room collision changes code, a resumed room retries the same id for 15 seconds', async t => {
  const {peers, statuses, codes, tick} = await harness(t, {fresh:true});
  const collision = {type:'unavailable-id'};
  peers[0].emit('error', collision);
  assert.equal(codes.length, 1);
  await tick(1000);
  assert.equal(peers[1].id, L.peerId(codes[0]));
  peers[1].emit('open'); // After registration, this is the room to recover.
  peers[1].emit('disconnected');
  await tick(500);
  const id = peers[2].id;
  for (let i = 0; i <= 15; i++) {
    const peer = peers.at(-1);
    assert.equal(peer.id, id);
    peer.emit('error', collision);
    if (i < 15) {
      assert.equal(statuses.at(-1)[0], 'waiting');
      await tick(1000);
    }
  }
  assert.equal(statuses.at(-1)[0], 'collision');
  const count = peers.length;
  await tick(5000);
  assert.equal(peers.length, count);
});

test('phone wakes and retries automatically without starting parallel peers or replaying old commands', async t => {
  const {peers, events, visibility, statuses, tick} = await harness(t, {role:'phone'});
  events.dispatchEvent(new Event('pageshow'));
  await Promise.resolve();
  assert.equal(peers.length, 1);
  const peer = peers[0];
  peer.emit('open');
  assert.equal(peer.id, undefined);
  assert.equal(peer.target, 'hmarkus32-dond-k7qx');
  peer.channel.accept();
  visibility.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(peer.channel.sent, [{type:'ping'}]);
  peer.channel.close();
  assert.equal(statuses.at(-1)[0], 'reconnecting');
  await tick(500);
  assert.equal(peers.length, 2);
  peers[1].emit('error', {type:'network'});
  assert.match(statuses.at(-1)[1], /Keep playing on the iPad/);
  events.dispatchEvent(new Event('online'));
  await Promise.resolve();
  assert.equal(peers.length, 3);
  peers[2].emit('open');
  peers[2].channel.accept();
  peers[2].channel.emit('data', {type:'replaced'});
  await tick(30000);
  assert.equal(peers.length, 3);
  assert.equal(statuses.at(-1)[0], 'replaced');
});
