'use strict';

(() => {
  const G = window.DOND;
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
  if (G.validateAmounts(settings.amounts).error || typeof settings.title !== 'string') settings = G.defaultSettings();
  let game = read(keys.state, null);
  let presets = read(keys.presets, []);
  const builtins = [{name:'Family $100', amounts:G.FAMILY}, {name:'Classic TV', amounts:G.CLASSIC}];
  let setupOpen = false;
  let timer;
  let audio;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const dialog = $('host-dialog');
  const fields = [];
  const allPresets = () => [...builtins, ...presets];
  const sameBoard = (a, b) => a.length === b.length && a.every((n, i) => n === b[i]);
  const active = () => game && game.phase !== 'result';

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
        tone.start(start);
        tone.stop(start + .2);
        tone.onended = () => { tone.disconnect(); gain.disconnect(); };
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
    if (settings.muted) audio?.suspend().catch(() => {});
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
    const actions = [['Resume', null, true], ['Play Again', menuAction(restart)], ['New Game', menuAction(newGame)]];
    if (!active() && !setupOpen) actions.push(['Setup', menuAction(openSetup)]);
    modal('Game menu', '', actions);
  };
  $('start').onclick = restart;
  $('setup').onclick = openSetup;

  function transition(next) {
    clearTimeout(timer);
    game = next;
    write(keys.state, game);
    render();
  }
  function advance() {
    if (!game || dialog.open) return;
    if (game.phase === 'reveal') transition(G.finishReveal(game));
    else if (game.phase === 'call') transition(G.showOffer(game));
  }
  function schedule() {
    clearTimeout(timer);
    if (!dialog.open && ['reveal','call'].includes(game?.phase)) {
      timer = setTimeout(advance, game.phase === 'call' ? 1550 : 1700);
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
    $('board-name').textContent = (preset?.name || 'Custom') + ' board';
    $('top-prize').textContent = money(settings.amounts[25]);
  }
  function render() {
    clearTimeout(timer);
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

  function board() {
    const opened = game.phase === 'reveal' ? game.opened.slice(0,-1) : game.opened;
    const out = new Set(opened.map(n => game.cases[n - 1]));
    const latest = game.cases[opened.at(-1) - 1];
    $('in-play').textContent = (26 - opened.length) + ' in play';
    const cells = game.amounts.map((value, i) => {
      const cell = document.createElement('span');
      cell.className = 'money' + (i >= 13 ? ' high' : '') + (out.has(value) ? ' out' : '');
      if (value === latest && ['open','call'].includes(game.phase)) cell.classList.add('new-out');
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
  const bigCase = n => '<div class="big-case" aria-label="Case ' + n + '">' + caseFace(n) + '</div>';
  const amount = value => '<div class="amount">' + money(value) + '</div>';

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
        content = scene(bigCase(last) + amount(game.cases[last - 1]), [['Continue', advance]], 'revealing');
        break;
      case 'call':
        heading = 'The Banker is calling…';
        content = scene('<div class="phone" aria-hidden="true">☎︎</div>', [['Answer call', advance, true]]);
        ring();
        break;
      case 'offer':
        heading = 'The Banker offers';
        content = scene(amount(game.offers.at(-1).amount) + '<p>Deal or no deal?</p>', [
          ['DEAL', () => transition(G.decideOffer(game, true)), true],
          ['NO DEAL', () => transition(G.decideOffer(game, false))]]);
        break;
      case 'swap': {
        label = 'The final two';
        heading = 'Keep or swap?';
        const other = G.remainingNumbers(game).find(n => n !== chosen);
        content = scene('<p>Keep your case <b>#' + chosen + '</b> or swap for case <b>#' + other + '</b>?</p>', [
          ['Keep #' + chosen, () => transition(G.finishSwap(game, false)), true],
          ['Swap for #' + other, () => transition(G.finishSwap(game, true))]]);
        break;
      }
      case 'finalReveal':
        label = result.type === 'deal' ? 'Deal accepted' : 'Final reveal';
        heading = 'Inside your case #' + chosen;
        content = scene(bigCase(chosen) + amount(game.cases[chosen - 1]), [
          ['Show result', () => transition(G.showResult(game)), true]], 'revealing');
        break;
      case 'result': {
        label = 'Game complete';
        heading = 'You won';
        let comparison;
        if (result.type === 'deal') {
          comparison = result.difference < 0 ? 'The Banker beat you by ' : 'You beat the Banker by ';
          comparison = result.difference === 0 ? 'Your deal matched your case.' : comparison + money(Math.abs(result.difference)) + '.';
          comparison += ' Your case held ' + money(result.caseValue) + '.';
        } else comparison = 'The other case, #' + result.other + ', held ' + money(result.otherAmount) + '.';
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
    board();
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
    list.replaceChildren(...allPresets().map((p, i) => new Option(p.name, String(i))));
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
  $('preset-list').onchange = () => { $('delete-preset').disabled = Number($('preset-list').value) < builtins.length; };
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
})();
