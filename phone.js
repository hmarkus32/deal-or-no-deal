'use strict';

(() => {
  const L = window.DONDLink;
  const $ = id => document.getElementById(id);
  const money = window.DOND.formatMoney;
  const controls = $('phone-controls');
  let connection, state, timer, room, linked = false;
  const el = (tag, text, style = '') => {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = style;
    return node;
  };

  function command(label, action, style = '', n) {
    const btn = el('button', label, style);
    const {phase, rev} = state;
    btn.onclick = () => { if (linked) connection.send({type:'cmd', action, phase, rev, n}); };
    return btn;
  }
  function cases() {
    const grid = el('div', '', 'case-grid');
    for (let n = 1; n <= 26; n++) {
      const held = n === state.chosen;
      const opened = state.opened.some(c => c.n === n);
      const btn = command('', 'selectCase', 'case-button' + (held ? ' held' : ''), n);
      btn.disabled = held || opened;
      btn.setAttribute('aria-label', 'Case ' + n + (held ? ', your case' : opened ? ', opened' : ''));
      btn.append(el('span', String(n).padStart(2, '0'), 'case-face'));
      grid.append(btn);
    }
    return grid;
  }
  function render() {
    clearInterval(timer);
    const {phase, offer, result} = state;
    $('phone-title').textContent = state.title;
    $('phone-heading').textContent = state.heading;
    $('phone-round').textContent = state.round ? 'Round ' + state.round + ' of 9' : '';
    document.body.classList.toggle('banker-call', phase === 'call' || phase === 'line');
    controls.dataset.phase = phase;
    controls.replaceChildren();
    switch (phase) {
      case 'pick':
      case 'open':
        controls.append(cases());
        break;
      case 'reveal':
        controls.append(command('Continue', 'continue', 'gold'));
        break;
      case 'call':
        controls.append(el('div', '☎︎', 'phone'), command('Answer', 'answer', 'answer'));
        break;
      case 'line': {
        const clock = el('p', '', 'call-timer');
        const since = Date.now() - state.lineElapsed;
        const tick = () => {
          const seconds = Math.max(0, Math.floor((Date.now() - since) / 1000));
          clock.textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
        };
        tick();
        timer = setInterval(tick, 1000);
        controls.append(clock, el('div', money(offer), 'amount'), command('Hang up', 'hangUp', 'hang-up'));
        break;
      }
      case 'offer':
        controls.append(el('div', money(offer), 'amount'), command('DEAL', 'deal', 'gold'), command('NO DEAL', 'noDeal'));
        break;
      case 'swap':
        controls.append(command('Keep #' + state.chosen, 'keep', 'gold'), command('Swap for #' + state.other, 'swap'));
        break;
      case 'finalReveal':
        if (result.type !== 'deal') {
          controls.append(command('Open case #' + result.other, 'openOther', 'gold'));
          break;
        }
        // A deal goes directly from the chosen case to the result.
      case 'otherReveal':
        controls.append(command('Show result', 'showResult', 'gold'));
        break;
      case 'result':
        controls.append(el('div', money(result.winnings), 'amount'), el('p', 'Game over, use the stage for Play Again.'));
        break;
    }
  }
  function join(code) {
    connection?.stop();
    room = code;
    state = null;
    $('join-room').hidden = true;
    $('remote').hidden = false;
    const url = new URL(location.href);
    url.searchParams.set('room', code);
    if (url.href !== location.href) history.replaceState(null, '', url);
    function onStatus(status, detail) {
      linked = status === 'linked';
      $('phone-status').dataset.state = status;
      $('phone-status').textContent = linked ? 'Linked · ' + room :
        status === 'reconnecting' ? 'Reconnecting…' : status === 'replaced' ? 'Disconnected' : 'Connecting…';
      if (linked) return;
      if (state?.phase === 'call') navigator.vibrate?.(0);
      state = null;
      clearInterval(timer);
      document.body.classList.remove('banker-call');
      $('phone-round').textContent = 'Room ' + room;
      $('phone-heading').textContent = detail || 'Connecting to the stage…';
      const change = el('button', 'Enter room code');
      change.onclick = () => {
        connection.stop();
        $('remote').hidden = true;
        $('join-room').hidden = false;
        $('phone-status').textContent = 'Offline';
        $('code').focus();
      };
      controls.replaceChildren(change);
      controls.dataset.phase = '';
    }
    onStatus('connecting');
    connection = L.transport({role:'phone', code, onStatus});
    connection.onMessage(next => {
      if (!linked || next?.type !== 'snapshot' || !Number.isSafeInteger(next.rev) || (state && next.rev <= state.rev)) return;
      if (state?.phase !== 'call' && next.phase === 'call') navigator.vibrate?.([200, 100, 200]);
      else if (state?.phase === 'call' && next.phase !== 'call') navigator.vibrate?.(0);
      state = next;
      render();
    });
  }
  $('join-room').onsubmit = event => {
    event.preventDefault();
    const code = L.normalizeCode($('code').value);
    if (code) { $('join-error').textContent = ''; join(code); }
    else $('join-error').textContent = 'Enter the four-character code shown on the stage.';
  };
  const initial = L.normalizeCode(new URLSearchParams(location.search).get('room'));
  if (initial) join(initial);
})();
