'use strict';

const DONDLink = (() => {
  const G = typeof module === 'undefined' ? window.DOND : require('./game-logic.js');
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const linkError = "Couldn’t link the phone. Keep playing on the iPad.";

  function roomCode() {
    const bytes = crypto.getRandomValues(new Uint32Array(4));
    return Array.from(bytes, n => alphabet[n % alphabet.length]).join('');
  }
  function normalizeCode(value) {
    if (typeof value !== 'string') return null;
    const code = value.trim().toUpperCase();
    return code.length === 4 && [...code].every(c => alphabet.includes(c)) ? code : null;
  }
  function peerId(code) {
    const valid = normalizeCode(code);
    return valid && 'hmarkus32-dond-' + valid.toLowerCase();
  }

  function snapshot(game, rev, {title = G.TITLE, setup = false, lineElapsed = 0} = {}) {
    const base = {type:'snapshot', rev, title:game?.title || title, phase:setup ? 'setup' : game?.phase || 'title'};
    if (!game || setup) return {...base, heading:'Waiting for the stage to start a game…'};
    const {phase, chosen, round, result} = game;
    const remaining = G.remainingNumbers(game);
    const last = game.opened.at(-1);
    const other = remaining.find(n => n !== chosen);
    const left = G.opensLeft(game);
    const headings = {
      pick:'Pick your case', open:'Open ' + left + ' more ' + (left === 1 ? 'case' : 'cases'),
      reveal:'Opening case #' + last + '…', call:'The Banker is calling…', line:'The Banker',
      offer:'Deal or no deal?', swap:'Keep or swap?', finalReveal:'Inside your case #' + chosen,
      otherReveal:'Inside the other case #' + result?.other, result:'Game over'
    };
    const opened = G.revealedCaseNumbers(game, true).map(n => ({n, amount:game.cases[n - 1]}));
    const state = {...base, heading:headings[phase], round, chosen, remaining:26 - opened.length, opened};
    if (['line','offer','swap','finalReveal','otherReveal','result'].includes(phase)) state.offer = game.offers.at(-1).amount;
    if (phase === 'line') state.lineElapsed = lineElapsed;
    if (phase === 'swap') state.other = other;
    // result.otherAmount is already known to the stage during finalReveal. Never copy result wholesale.
    if (result) state.result = {type:result.type, winnings:result.winnings, other:result.other};
    return state;
  }

  function applyCommand(game, cmd, rev = cmd?.rev) {
    if (!game || !cmd || cmd.type !== 'cmd' || cmd.phase !== game.phase ||
        !Number.isSafeInteger(cmd.rev) || cmd.rev < 0 || cmd.rev !== rev) return game;
    switch (cmd.action) {
      case 'selectCase': return G.selectCase(game, cmd.n);
      case 'continue': return G.finishReveal(game);
      case 'answer': return G.answerCall(game);
      case 'hangUp': return G.hangUp(game);
      case 'deal': return G.decideOffer(game, true);
      case 'noDeal': return G.decideOffer(game, false);
      case 'keep': return G.finishSwap(game, false);
      case 'swap': return G.finishSwap(game, true);
      case 'openOther': return G.revealOtherCase(game);
      case 'showResult': return G.showResult(game);
      default: return game;
    }
  }

  // Bind the same command/snapshot exchange to a data channel or an in-memory test transport.
  function serve(transport, getSnapshot, command) {
    const publish = () => transport.send(getSnapshot());
    transport.onOpen(publish);
    transport.onMessage(message => {
      if (!command(message)) publish(); // A stale tap gets the current screen back.
    });
    return publish;
  }

  let scriptReady;
  function loadPeer() {
    if (window.Peer) return Promise.resolve(window.Peer);
    if (!scriptReady) scriptReady = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/peerjs.min.js';
      script.onload = () => window.Peer ? resolve(window.Peer) : reject(new Error(linkError));
      script.onerror = () => { script.remove(); reject(new Error(linkError)); };
      document.head.append(script);
    }).catch(error => { scriptReady = null; throw error; });
    return scriptReady;
  }

  // One live channel. Only a fully opened incoming phone can displace the current one.
  // Link timing. The stage pings every 2 s and treats 8 s of silence as a lost phone, so it falls
  // back to on-stage buttons within about 10 s. A phone that loses the stage retries straight away.
  const PING_MS = 2000, SILENT_MS = 8000, CONNECT_MS = 8000, PHONE_RETRY_MAX = 3000, STAGE_RETRY_MAX = 5000;
  function transport({role, code, fresh = false, onCode = () => {}, onStatus, getPeer = loadPeer}) {
    const stage = role === 'stage';
    let peer, channel, retryTimer, watchdog, heartbeat;
    let lastSeen = 0, connectingSince = null;
    let generation = 0, stopped = false, connected = false, backoff = 500, collisionSince = null;
    let message = () => {}, opened = () => {}, closed = () => {};

    function dropChannel(replaced = false) {
      clearInterval(heartbeat);
      const old = channel;
      channel = null;
      if (old && replaced) {
        old.send({type:'replaced'});
        old.close({flush:true});
      } else old?.close();
      if (connected) { connected = false; closed(); }
    }
    function reset() {
      generation++;
      connectingSince = null;
      clearTimeout(retryTimer);
      clearTimeout(watchdog);
      dropChannel();
      peer?.destroy();
      peer = null;
    }
    function retry(detail = linkError, now = false) {
      reset();
      onStatus(stage ? 'lost' : 'reconnecting', detail);
      retryTimer = setTimeout(start, now ? 0 : backoff);
      if (!now) backoff = Math.min(stage ? STAGE_RETRY_MAX : PHONE_RETRY_MAX, backoff * 2);
    }
    function attach(conn, token) {
      const current = () => !stopped && generation === token;
      const active = () => current() && channel === conn;
      const handshake = setTimeout(() => {
        if (!current() || active()) return;
        conn.close();
        if (stage && !connected) onStatus('lost', linkError);
      }, CONNECT_MS);
      conn.on('open', () => {
        clearTimeout(handshake);
        if (!current()) { conn.close(); return; }
        dropChannel(stage);
        channel = conn;
        connected = true;
        connectingSince = null;
        clearTimeout(watchdog);
        backoff = 500;
        lastSeen = Date.now();
        heartbeat = setInterval(() => {
          if (Date.now() - lastSeen >= SILENT_MS) { lost(); return; }
          conn.send({type:'ping'});
        }, PING_MS);
        onStatus('linked');
        opened();
      });
      function lost() {
        clearTimeout(handshake);
        if (!current()) return;
        // A phone that had a live channel retries at once (the stage may just have reloaded).
        if (!stage) { const wasLive = active(); if (wasLive) backoff = 500; retry(linkError, wasLive); return; }
        if (active()) { dropChannel(); onStatus('lost', linkError); }
        else if (!connected) onStatus('lost', linkError);
      }
      conn.on('data', data => {
        if (!active()) return;
        lastSeen = Date.now();
        if (data?.type === 'ping') conn.send({type:'pong'});
        else if (!stage && data?.type === 'replaced') {
          stop();
          onStatus('replaced', 'Another phone is linked to this room.');
        } else if (data?.type !== 'pong') message(data);
      });
      conn.on('close', () => {
        clearTimeout(handshake);
        if (active()) lost();
      });
      conn.on('error', lost);
    }
    async function start() {
      if (stopped) return;
      reset();
      const token = generation;
      connectingSince = Date.now();
      watchdog = setTimeout(retry, CONNECT_MS);
      try {
        const Peer = await getPeer();
        if (generation !== token) return;
        peer = stage ? new Peer(peerId(code)) : new Peer();
        peer.on('open', () => {
          if (generation !== token) return;
          collisionSince = null;
          if (stage) {
            clearTimeout(watchdog);
            fresh = false;
            onStatus('waiting');
          } else attach(peer.connect(peerId(code), {reliable:true, serialization:'json'}), token);
        });
        peer.on('connection', conn => {
          if (stage && generation === token) attach(conn, token);
          else conn.close();
        });
        peer.on('error', err => {
          if (generation !== token) return;
          if (stage && err.type === 'unavailable-id') {
            collisionSince ??= Date.now();
            if (fresh) { code = roomCode(); onCode(code); }
            else if (Date.now() - collisionSince >= 15000) {
              stop();
              onStatus('collision', 'Room code still in use. Choose a new code to link.');
              return;
            }
            reset();
            onStatus('waiting', 'Registering room…');
            retryTimer = setTimeout(start, 1000);
          } else retry();
        });
        peer.on('disconnected', () => { if (generation === token) retry(); });
        peer.on('close', () => { if (generation === token) retry(); });
      } catch { if (generation === token) retry(); }
    }
    function wake() {
      if (stopped || document.hidden || stage) return;
      // pageshow also fires on initial load while PeerJS is still obtaining a random id.
      if (connectingSince !== null && Date.now() - connectingSince < 15000) return;
      if (connected && Date.now() - lastSeen < SILENT_MS) channel.send({type:'ping'});
      else {
        onStatus('reconnecting');
        start();
      }
    }
    function stop() {
      stopped = true;
      reset();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('pageshow', wake);
    }
    if (!stage) {
      document.addEventListener('visibilitychange', wake);
      window.addEventListener('online', wake);
      window.addEventListener('pageshow', wake);
    }
    start();
    return {send(data) { if (channel?.open) channel.send(data); },
      onMessage(fn) { message = fn; }, onOpen(fn) { opened = fn; }, onClose(fn) { closed = fn; }, stop};
  }
  return {roomCode, normalizeCode, peerId, snapshot, applyCommand, serve, transport, linkError};
})();
if (typeof window !== 'undefined') window.DONDLink = DONDLink;
if (typeof module !== 'undefined') module.exports = DONDLink;
