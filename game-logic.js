'use strict';

const DOND = (() => {
  const FAMILY = Object.freeze([0.01, 0.05, 0.10, 0.25, 0.50, 0.75, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 100]);
  const CLASSIC = Object.freeze([0.01, 1, 5, 10, 25, 50, 75, 100, 200, 300, 400, 500, 750, 1000, 5000, 10000, 25000, 50000, 75000, 100000, 200000, 300000, 400000, 500000, 750000, 1000000]);
  const TITLE = 'Deal or No Deal';
  const SCHEDULE = Object.freeze([6, 5, 4, 3, 2, 1, 1, 1, 1]);
  const FACTORS = Object.freeze([0.30, 0.38, 0.47, 0.56, 0.66, 0.75, 0.84, 0.92, 0.98]);

  function defaultSettings() {
    return {title: TITLE, amounts: [...FAMILY], muted: false};
  }

  function validateAmounts(values) {
    if (!Array.isArray(values) || values.length !== 26) return {error: 'Enter exactly 26 amounts.'};
    const numbers = [];
    const seen = new Set();
    for (const [index, value] of values.entries()) {
      const input = String(value).trim().replace(/^\$\s*/, '');
      const amount = Number(input.replaceAll(',', ''));
      if (!/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?|\.\d{1,2})$/.test(input) || !Number.isFinite(amount) || amount <= 0) {
        return {error: 'Amount ' + (index + 1) + ' must be a positive number with up to two decimals.', index};
      }
      if (seen.has(amount)) return {error: 'Amount ' + (index + 1) + ' is repeated. Enter a unique amount.', index};
      seen.add(amount);
      numbers.push(amount);
    }
    return {amounts: numbers.sort((a, b) => a - b)};
  }

  function formatMoney(n) {
    const digits = n < 1 || !Number.isInteger(n) ? 2 : 0;
    return '$' + n.toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits});
  }

  function random() {
    if (!globalThis.crypto?.getRandomValues) return Math.random();
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  }

  function shuffle(amounts, rng = random) {
    const cases = [...amounts];
    for (let i = cases.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cases[i], cases[j]] = [cases[j], cases[i]];
    }
    return cases;
  }

  function roundNice(amount) {
    const step = amount < 1 ? 0.01 : amount < 10 ? 0.05 : amount < 100 ? 1 :
      amount < 1000 ? 5 : amount < 10000 ? 50 : Math.max(500, 10 ** (Math.floor(Math.log10(amount)) - 2));
    return Number((Math.round(amount / step) * step).toFixed(2));
  }

  /**
   * Each offer is the expected value of every unopened case (including yours),
   * multiplied by the round factor and a uniform jitter from 0.95 to 1.05.
   * Round to a board-appropriate increment, then clamp to the live prize range.
   * rng supplies a uniform number in [0, 1); inject () => 0.5 for neutral jitter.
   */
  function bankerOffer(remaining, round, rng = random) {
    const total = remaining.reduce((sum, n) => sum + n, 0);
    const mean = Number.isFinite(total) ? total / remaining.length :
      remaining.reduce((sum, n) => sum + n / remaining.length, 0);
    const raw = mean * FACTORS[round - 1] * (0.95 + rng() * 0.10);
    return Math.min(Math.max(...remaining), Math.max(Math.min(...remaining), roundNice(raw)));
  }

  function newGame(settings, rng = random) {
    const validated = validateAmounts(settings.amounts);
    if (validated.error) throw new RangeError(validated.error);
    return {title: settings.title, amounts: validated.amounts, cases: shuffle(validated.amounts, rng),
      chosen: null, opened: [], round: 1, offers: [], phase: 'pick', result: null};
  }

  function remainingNumbers(game) {
    return game.cases.map((_, i) => i + 1).filter(n => !game.opened.includes(n));
  }

  function opensLeft(game) {
    return SCHEDULE.slice(0, game.round).reduce((sum, n) => sum + n, 0) - game.opened.length;
  }

  function selectCase(game, number) {
    if (!Number.isInteger(number) || number < 1 || number > 26) return game;
    if (game.phase === 'pick') return {...game, chosen: number, phase: 'open'};
    if (game.phase !== 'open' || number === game.chosen || game.opened.includes(number)) return game;
    return {...game, opened: [...game.opened, number], phase: 'reveal'};
  }

  function finishReveal(game, rng = random) {
    if (game.phase !== 'reveal') return game;
    if (opensLeft(game) > 0) return {...game, phase: 'open'};
    const values = remainingNumbers(game).map(n => game.cases[n - 1]);
    const offer = {amount: bankerOffer(values, game.round, rng), decision: null};
    return {...game, offers: [...game.offers, offer], phase: 'call'};
  }

  function showOffer(game) {
    return game.phase === 'call' ? {...game, phase: 'offer'} : game;
  }

  function decideOffer(game, deal) {
    if (game.phase !== 'offer') return game;
    const offer = game.offers[game.offers.length - 1];
    const offers = [...game.offers.slice(0, -1), {...offer, decision: deal ? 'deal' : 'no deal'}];
    if (!deal) return game.round === SCHEDULE.length ? {...game, offers, phase: 'swap'} :
      {...game, offers, round: game.round + 1, phase: 'open'};
    const caseValue = game.cases[game.chosen - 1];
    const difference = Number((offer.amount - caseValue).toFixed(2));
    return {...game, offers, phase: 'finalReveal', result: {type: 'deal', winnings: offer.amount,
      caseValue, difference, good: difference >= 0}};
  }

  function finishSwap(game, swap) {
    if (game.phase !== 'swap') return game;
    const last = remainingNumbers(game).find(n => n !== game.chosen);
    const chosen = swap ? last : game.chosen;
    const other = swap ? game.chosen : last;
    const winnings = game.cases[chosen - 1];
    return {...game, chosen, phase: 'finalReveal', result: {type: swap ? 'swap' : 'keep', winnings,
      other, otherAmount: game.cases[other - 1], good: winnings >= game.amounts[13]}};
  }

  function revealOtherCase(game) {
    if (game.phase !== 'finalReveal' || game.result.type === 'deal') return game;
    return {...game, phase: 'otherReveal'};
  }

  function showResult(game) {
    const dealRevealed = game.phase === 'finalReveal' && game.result.type === 'deal';
    return dealRevealed || game.phase === 'otherReveal' ? {...game, phase: 'result'} : game;
  }

  return {TITLE, FAMILY, CLASSIC, SCHEDULE, FACTORS, defaultSettings, validateAmounts, formatMoney,
    shuffle, roundNice, bankerOffer, newGame, remainingNumbers, opensLeft, selectCase, finishReveal,
    showOffer, decideOffer, finishSwap, revealOtherCase, showResult};
})();

if (typeof window !== 'undefined') window.DOND = DOND;
if (typeof module !== 'undefined') module.exports = DOND;
