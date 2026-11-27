'use strict';

(() => {
  const G = window.DOND;
  const L = window.DONDLink;
  const $ = id => document.getElementById(id);
  const money = G.formatMoney;
  const keys = {state: 'dond-state-v1', settings: 'dond-settings-v1', presets: 'dond-presets-v1'};
  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }
  function write(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch { /* Keep this session playable if the browser blocks storage. */ }
  }
  let settings = read(keys.settings, G.defaultSettings());
  if (!settings || G.validateAmounts(settings.amounts).error || typeof settings.title !== 'string') settings = G.defaultSettings();
  // One-time upgrade: a browser that saved the old default board moves to the new default.
  // Picking "Family $100 (Classic)" afterwards sticks, because the marker is only written once.
  const upgradeKey = 'dond-default-board-v2';
  if (!read(upgradeKey, false)) {
    if (settings.amounts.length === 26 && settings.amounts.every((n, i) => n === G.FAMILY_CLASSIC[i])) {
      settings = {...settings, amounts: [...G.FAMILY]};
      write(keys.settings, settings);
    }
    write(upgradeKey, true);
  }
  let game = read(keys.state, null);
  let presets = read(keys.presets, []);
  const builtins = G.PRESETS;
  let setupOpen = false;
  let timer;
  let audio;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const dialog = $('host-dialog');
  const fields = [];
  const allPresets = () => [...builtins, ...presets];
  const sameBoard = (a, b) => a.length === b.length && a.every((n, i) => n === b[i]);
  const active = () => game && game.phase !== 'result';

  const roomKey = 'dond-room-v1';
  const revKey = 'dond-link-rev-v1';
  const lineKey = 'dond-line-start-v1';
  let room = L.normalizeCode(read(roomKey, null));
  let rev = read(revKey, 0);
  let lineSince = game?.phase === 'line' ? read(lineKey, Date.now()) : null;
  let connection, publish, linked = false;
  let status = 'waiting', detail = '';

  function drawPhoneQr(url) {
    const box = $('phone-qr');
    if (box.dataset.url === url) return;
    box.dataset.url = url || '';
    box.replaceChildren();
    if (!url || typeof qrcode !== 'function') return;
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    box.innerHTML = qr.createSvgTag({scalable:true, margin:4, cellSize:1});
  }
  function updateLinkUI() {

    const pill = $('link-status');
    pill.hidden = !room;
    document.body.classList.toggle('has-room', !!room);
    if (!room) return;
    pill.dataset.state = status;
    pill.textContent = linked ? 'Phone linked · ' + room : status === 'waiting' ? 'Waiting for phone · ' + room : 'Link lost · play on stage';
    pill.title = detail || pill.textContent;
    $('room-code').textContent = room;
    const url = L.phoneUrl(location.href, room);
    $('host-url').textContent = url;
    $('host-url').href = url;
    drawPhoneQr(url);
    $('link-detail').textContent = detail || (linked ? 'Phone linked.' : 'Scan the code with your phone, or open the host URL to join.');
    $('new-code').hidden = status !== 'collision';
  }
  function register(fresh) {
    connection?.stop();
    linked = false;
    if (fresh) room = L.roomCode();
    write(roomKey, room);
    write(revKey, rev);
    status = 'waiting';
    detail = 'Registering room…';
    updateLinkUI();
    connection = L.transport({role:'stage', code:room, fresh,
      onCode(code) { room = code; write(roomKey, room); updateLinkUI(); },
      onStatus(next, reason = '') {
        const wasLinked = linked;
        status = next; detail = reason;
        linked = next === 'linked';
        updateLinkUI();
        if (wasLinked !== linked && ['call','line','offer','swap'].includes(game?.phase)) renderGame();
      }
    });
    publish = L.serve(connection,
      () => L.snapshot(game, rev, {title:settings.title, setup:setupOpen, lineElapsed:lineSince ? Date.now() - lineSince : 0}),
      cmd => {
        const next = L.applyCommand(setupOpen ? null : game, cmd, rev);
        if (!next || next === game) return false;
        if (dialog.open) dialog.close();
        transition(next);
        return true;
      });
  }
  function stopLink() {
    connection?.stop();
    connection = publish = null;
    room = null; linked = false;
    write(roomKey, null);
    updateLinkUI();
    if (game && !setupOpen) renderGame();
  }
  function linkPanel() {
    if (!room) register(true);
    modal('Link host phone', '', [['Done', null, true],
      ['Stop linking', menuAction(() => confirmAction('Stop linking?', 'Continue this game on the stage.', 'Stop linking', stopLink))]]);
    $('link-panel').hidden = false;
    updateLinkUI();
  }
  $('link-phone').onclick = linkPanel;
  $('new-code').onclick = () => register(true);

  // Browsers require the host to unlock sound with a click or keypress.
  function unlockAudio() {
    if (settings.muted) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    try {
      audio ??= new Context();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
    } catch { /* Visual call cue is always present. */ }
  }
  document.addEventListener('click', unlockAudio, {capture:true});
  let ringInterval;
  const tones = new Set();
  function silence() {
    for (const tone of tones) { tone.disconnect(); tone.stop(); }
    tones.clear();
  }
  function callEffects() {
    const phase = game?.phase;
    document.body.classList.toggle('banker-call', phase === 'call' || phase === 'line');
    if (phase === 'call' && !ringInterval) {
      ring();
      ringInterval = setInterval(ring, 2000);
    } else if (phase !== 'call' && ringInterval) {
      clearInterval(ringInterval);
      ringInterval = null;
      silence();
    }
  }
  function ring() {
    if (settings.muted || audio?.state !== 'running') return;
    for (const offset of [0, .25, .8, 1.05]) {
      for (const frequency of [440, 480]) {
        const start = audio.currentTime + offset;
        const tone = audio.createOscillator();
        const gain = audio.createGain();
        tone.frequency.value = frequency;
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(.055, start + .025);
        gain.gain.exponentialRampToValueAtTime(.0001, start + .19);
        tone.connect(gain).connect(audio.destination);
        tones.add(tone);
        tone.start(start);
        tone.stop(start + .2);
        tone.onended = () => { tones.delete(tone); tone.disconnect(); gain.disconnect(); };
      }
    }
  }
  function soundLabel() {
    $('sound-label').textContent = settings.muted ? 'Sound off' : 'Sound on';
    $('sound').setAttribute('aria-pressed', String(!settings.muted));
  }
  $('sound').onclick = () => {
    settings.muted = !settings.muted;
    write(keys.settings, settings);
    if (settings.muted) { silence(); audio?.suspend().catch(() => {}); }
    else unlockAudio();
    soundLabel();
  };

  function button(label, run, primary = false) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    if (primary) element.className = 'gold';
    element.onclick = run;
    return element;
  }

  function modal(title, copy, actions, withName = false) {
    $('link-panel').hidden = true;
    $('dialog-heading').textContent = title;
    $('dialog-copy').textContent = copy;
    $('dialog-copy').hidden = !copy;
    $('name-label').hidden = !withName;
    $('name-error').hidden = true;
    $('preset-name').value = '';
    $('dialog-actions').replaceChildren(...actions.map(([label, run, primary]) =>
      button(label, () => { if (run?.() !== false && dialog.open) dialog.close(); }, primary)));
    if (!dialog.open) dialog.showModal();
    if (withName) $('preset-name').focus();
    else $('dialog-actions').firstElementChild.focus();
  }
  function confirmAction(title, copy, label, run) {
    modal(title, copy, [['Cancel'], [label, run, true]]);
  }
  // Close the menu first so a follow-on confirmation can own the dialog.
  function menuAction(run) { return () => { dialog.close(); run(); return false; }; }
  function restart() {
    const run = () => { setupOpen = false; transition(G.newGame(settings)); };
    if (active() || setupOpen) confirmAction('Play again?', 'Start a fresh set of cases with your saved board?', 'Play again', run);
    else run();
  }
  function newGame() {
    confirmAction('Start a new game?', 'Return to the title screen with your saved title and amounts?', 'New Game', () => {
      setupOpen = false;
      transition(null);
    });
  }
  $('menu').onclick = () => {
    const actions = [['Resume', null, true], ['Play Again', menuAction(restart)], ['New Game', menuAction(newGame)], ['Link host phone', menuAction(linkPanel)]];
    if (!active() && !setupOpen) actions.push(['Setup', menuAction(openSetup)]);
    modal('Game menu', '', actions);
  };
  $('start').onclick = restart;
  $('setup').onclick = openSetup;

  function transition(next) {
    clearTimeout(timer);
    lineSince = next?.phase === 'line' ? Date.now() : null;
    write(lineKey, lineSince);
    game = next;
    write(keys.state, game);
    render();
  }
  function advance() {
    if (!game || dialog.open) return;
    if (game.phase === 'reveal') transition(G.finishReveal(game));
  }
  function schedule() {
    clearTimeout(timer);
    if (!dialog.open && game?.phase === 'reveal') {
      timer = setTimeout(advance, 1700);
    }
  }
  dialog.addEventListener('close', schedule);

  function renderTitle() {
    const heading = $('game-title');
    heading.classList.toggle('custom', settings.title !== G.TITLE);
    if (settings.title === G.TITLE) {
      heading.innerHTML = '<span class="logo-line">DEAL</span> <span class="logo-or">OR</span> <span class="logo-line">NO DEAL</span>';
    } else heading.textContent = settings.title;
    const preset = allPresets().find(p => sameBoard(p.amounts, settings.amounts));
    const name = preset?.name || 'Custom';
    $('board-name').textContent = /board$/i.test(name) ? name : name + ' board';
  }
  function render() {
    clearTimeout(timer);
    callEffects();
    rev++;
    if (room) write(revKey, rev);
    publish?.();
    $('confetti').replaceChildren();
    $('title-screen').hidden = !!game || setupOpen;
    $('setup-screen').hidden = !setupOpen;
    $('game-screen').hidden = !game || setupOpen;
    $('brand-name').textContent = game && !setupOpen ? game.title : 'Game Night';
    document.title = game?.title || settings.title;
    soundLabel();
    if (setupOpen) return;
    if (game) renderGame();
    else renderTitle();
  }

  function board(revealComplete = false) {
    const opened = G.revealedCaseNumbers(game, revealComplete);
    const out = new Set(opened.map(n => game.cases[n - 1]));
    const latest = game.cases[opened.at(-1) - 1];
    $('in-play').textContent = (26 - opened.length) + ' in play';
    const cells = game.amounts.map((value, i) => {
      const cell = document.createElement('span');
      cell.className = 'money' + (i >= 13 ? ' high' : '') + (out.has(value) ? ' out' : '');
      if (value === latest && (revealComplete || ['open','call'].includes(game.phase))) cell.classList.add('new-out');
      cell.textContent = money(value);
      if (out.has(value)) cell.setAttribute('aria-label', cell.textContent + ' eliminated');
      return cell;
    });
    $('money-board').replaceChildren(...cells);
  }
  function caseFace(number) {
    // Case numbers always come from the fixed 1–26 board.
    return '<span class="case-face">' + String(number).padStart(2, '0') + '</span>';
  }
  function caseGrid() {
    const grid = document.createElement('div');
    grid.className = 'case-grid';
    for (let n = 1; n <= 26; n++) {
      const held = n === game.chosen;
      const opened = game.opened.includes(n);
      const tile = button('', () => transition(G.selectCase(game, n)));
      tile.className = 'case-button' + (held ? ' held' : '');
      tile.disabled = held || opened;
      tile.setAttribute('aria-label', 'Case ' + n + (held ? ', your case' : opened ? ', opened' : ''));
      tile.innerHTML = caseFace(n);
      grid.append(tile);
    }
    return grid;
  }
  function scene(content, actions = [], style = '') {
    const panel = document.createElement('div');
    panel.className = 'scene ' + style;
    panel.innerHTML = content;
    const controls = document.createElement('div');
    controls.className = 'actions';
    controls.append(...actions.map(args => button(...args)));
    if (actions.length) panel.append(controls);
    return panel;
  }
  const bigCase = (n, gold = true) => '<div class="big-case' + (gold ? ' gold-case' : '') +
    '" aria-label="Case ' + n + '">' + caseFace(n) + '</div>';
  const amount = value => '<div class="amount">' + money(value) + '</div>';

  function revealScene(number, gold, action) {
    const openedCase = '<div class="reveal-case' + (gold ? ' gold-case' : '') + '" aria-hidden="true">' +
      caseFace(number) + '<span class="case-lid"></span></div>';
    return scene(amount(game.cases[number - 1]) + openedCase, [action], 'revealing');
  }

  function swapChoice(number, swap) {
    const choice = document.createElement('div');
    choice.className = 'swap-choice';
    choice.innerHTML = '<p>' + (swap ? 'Last case' : 'Your case') + '</p>' + bigCase(number, !swap);
    choice.append(button((swap ? 'Swap for #' : 'Keep #') + number,
      () => transition(G.finishSwap(game, swap)), !swap));
    return choice;
  }

  function renderGame() {
    const {phase, round, chosen, result} = game;
    let label = 'Round ' + round + ' of 9';
    let heading;
    let content;
    const last = game.opened.at(-1);
    switch (phase) {
      case 'pick':
        label = '26 sealed briefcases';
        heading = 'Pick your case';
        content = caseGrid();
        break;
      case 'open': {
        const left = G.opensLeft(game);
        heading = 'Open ' + left + ' more ' + (left === 1 ? 'case' : 'cases');
        content = caseGrid();
        break;
      }
      case 'reveal':
        heading = 'Inside case #' + last;
        content = revealScene(last, true, ['Continue', advance]);
        break;
      case 'call':
        heading = 'The Banker is calling…';
        content = scene('<div class="phone" aria-hidden="true">☎︎</div>' + (linked ? '<p>Waiting for the host to answer…</p>' : ''),
          linked ? [] : [['Answer', () => transition(G.answerCall(game)), true]], 'call-scene answer-scene');
        break;
      case 'line':
        heading = 'The Banker is on the line…';
        content = scene('<div class="on-line-icon" aria-hidden="true">☎︎</div>' + (linked ? '<p>Host has the Banker on the line…</p>' : ''),
          linked ? [] : [['Hang up', () => transition(G.hangUp(game)), true]], 'call-scene hangup-scene');
        break;
      case 'offer':
        heading = 'The Banker offers';
        content = scene(amount(game.offers.at(-1).amount) + '<p>Deal or no deal?</p>', linked ? [] : [
          ['DEAL', () => transition(G.decideOffer(game, true)), true],
          ['NO DEAL', () => transition(G.decideOffer(game, false))]], 'offer');
        break;
      case 'swap': {
        label = 'The final two';
        heading = 'Keep or swap?';
        const other = G.remainingNumbers(game).find(n => n !== chosen);
        if (linked) {
          content = scene(bigCase(chosen) + '<p>Keep #' + chosen + ' or swap for #' + other + '?</p>');
          break;
        }
        content = scene('', [], 'swap-options');
        content.append(swapChoice(chosen, false), swapChoice(other, true));
        break;
      }
      case 'finalReveal':
        label = result.type === 'deal' ? 'Deal accepted' : 'Final reveal';
        heading = 'Inside your case #' + chosen;
        content = revealScene(chosen, result.type !== 'swap', result.type === 'deal'
          ? ['Show result', () => transition(G.showResult(game)), true]
          : ['Open case #' + result.other, () => transition(G.revealOtherCase(game)), true]);
        break;
      case 'otherReveal':
        label = 'What you could have won';
        heading = 'Inside the other case #' + result.other;
        content = revealScene(result.other, result.type === 'swap',
          ['Show result', () => transition(G.showResult(game)), true]);
        break;
      case 'result': {
        label = 'Game complete';
        heading = result.good ? 'You won!' : result.type === 'deal' ? 'Deal done' : 'Final result';
        let comparison;
        if (result.type === 'deal') {
          comparison = result.difference < 0 ? 'The Banker beat you by ' : 'You beat the Banker by ';
          comparison = result.difference === 0 ? 'Your deal matched your case.' : comparison + money(Math.abs(result.difference)) + '.';
          comparison += ' Your case held ' + money(result.caseValue) + '.';
        } else {
          const choice = result.type === 'keep' ? 'You kept #' : 'You swapped for #';
          comparison = choice + chosen + '. The other case, #' + result.other + ', held ' + money(result.otherAmount) + '.';
        }
        content = scene(amount(result.winnings) + '<p>' + comparison + '</p>', [
          ['Play Again', restart, true], ['New Game', newGame], ['Setup', openSetup]]);
        if (result.good && !reducedMotion.matches) celebrate();
        break;
      }
    }
    $('held').hidden = !chosen;
    $('held').querySelector('strong').textContent = '#' + chosen;
    $('round-label').textContent = label;
    $('play-heading').textContent = heading;
    $('play-area').replaceChildren(content);
    const prize = content.matches('.revealing') && content.querySelector('.amount');
    board(Boolean(prize) && reducedMotion.matches);
    if (prize && !reducedMotion.matches) {
      const markRevealed = () => { if (content.isConnected) board(true); };
      prize.addEventListener('animationend', markRevealed, {once:true});
      prize.addEventListener('animationcancel', markRevealed, {once:true});
    }
    $('play-heading').focus({preventScroll:true});
    schedule();
  }
  function celebrate() {
    const colors = ['#facd70','#fff1ca','#c29df1','#e0a7a0'];
    for (let i = 0; i < 55; i++) {
      const piece = document.createElement('i');
      piece.style.left = Math.random() * 100 + '%';
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = Math.random() * .8 + 's';
      piece.onanimationend = () => piece.remove();
      $('confetti').append(piece);
    }
  }

  for (let i = 1; i <= 26; i++) {
    const label = document.createElement('label');
    label.textContent = '#' + String(i).padStart(2,'0');
    const input = document.createElement('input');
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Amount ' + i);
    input.setAttribute('aria-describedby', 'setup-message');
    label.append(input);
    $('amount-fields').append(label);
    fields.push(input);
  }
  function draft() {
    const validated = G.validateAmounts(fields.map(input => input.value));
    const title = $('title-input').value.trim();
    const error = !title ? 'Enter a game title.' : validated.error;
    fields.forEach((input, i) => input.setAttribute('aria-invalid', String(i === validated.index)));
    $('title-input').setAttribute('aria-invalid', String(!title));
    $('setup-message').textContent = error || '';
    $('save-settings').disabled = !!error;
    $('save-preset').disabled = !!error;
    return error ? null : {...settings, title, amounts:validated.amounts};
  }
  function fillAmounts(amounts) {
    fields.forEach((input, i) => { input.value = String(amounts[i]); });
    draft();
  }
  function presetOptions(selected) {
    const list = $('preset-list');
    const label = (p, i) => p.name + ' · ' + money(p.amounts[0]) + '–' + money(p.amounts[25]) + (i === 0 ? ' (default)' : '');
    const option = (p, i) => new Option(label(p, i), String(i));
    const group = (name, items, offset) => {
      const g = document.createElement('optgroup');
      g.label = name;
      g.append(...items.map((p, i) => option(p, i + offset)));
      return g;
    };
    list.replaceChildren(group('Built-in boards', builtins, 0), ...(presets.length ? [group('Your saved boards', presets, builtins.length)] : []));
    list.value = String(Math.max(0, selected));
    $('delete-preset').disabled = Number(list.value) < builtins.length;
  }
  function openSetup() {
    if (active()) return;
    setupOpen = true;
    $('title-input').value = settings.title;
    fillAmounts(settings.amounts);
    presetOptions(allPresets().findIndex(p => sameBoard(p.amounts, settings.amounts)));
    render();
    $('setup-screen').querySelector('h2').focus({preventScroll:true});
  }
  $('settings-form').oninput = draft;
  $('settings-form').onsubmit = event => {
    event.preventDefault();
    const next = draft();
    if (!next) return;
    settings = next;
    write(keys.settings, settings);
    setupOpen = false;
    transition(null);
  };
  $('cancel-setup').onclick = () => { setupOpen = false; render(); };
  // Picking a board loads it straight away; Save setup keeps it for the next game.
  $('preset-list').onchange = () => {
    $('delete-preset').disabled = Number($('preset-list').value) < builtins.length;
    fillAmounts(allPresets()[Number($('preset-list').value)].amounts);
  };
  $('load-preset').onclick = () => fillAmounts(allPresets()[Number($('preset-list').value)].amounts);
  $('save-preset').onclick = () => {
    const next = draft();
    if (!next) return;
    modal('Save board preset', '', [['Cancel'], ['Save preset', () => {
      const name = $('preset-name').value.trim();
      if (!name || allPresets().some(p => p.name.toLowerCase() === name.toLowerCase())) {
        $('name-error').textContent = name ? 'That name is already in use.' : 'Enter a preset name.';
        $('name-error').hidden = false;
        $('preset-name').focus();
        return false;
      }
      presets.push({name, amounts:next.amounts});
      write(keys.presets, presets);
      presetOptions(allPresets().length - 1);
    }, true]], true);
  };
  $('preset-name').onkeydown = event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      $('dialog-actions').lastElementChild.click();
    }
  };
  $('delete-preset').onclick = () => {
    const index = Number($('preset-list').value) - builtins.length;
    if (index < 0) return;
    confirmAction('Delete preset?', 'Delete “' + presets[index].name + '” from this browser?', 'Delete', () => {
      presets.splice(index,1);
      write(keys.presets, presets);
      presetOptions(0);
    });
  };
  $('reset-defaults').onclick = () => confirmAction('Reset to defaults?', 'Restore the Family $100 board and the original game title?', 'Reset', () => {
    $('title-input').value = G.TITLE;
    fillAmounts(G.FAMILY);
    presetOptions(0);
  });
  render();
  if (room) register(false);
})();
