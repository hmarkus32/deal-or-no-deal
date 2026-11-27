'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../game-logic.js');

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
const neutral = () => 0.5;

test('a fresh board defaults to exactly Family $100 and settings are independent', () => {
  const expected = [.01,.25,.50,1,2,3,5,7,10,12,15,18,20,25,30,35,40,45,50,55,60,65,70,75,85,100];
  assert.deepEqual(G.FAMILY, expected);
  assert.equal(G.FAMILY[12], 20, '$20 tops the low column');
  const settings = G.defaultSettings();
  assert.deepEqual(settings, {title:'Deal or No Deal', amounts:expected, muted:false});
  settings.amounts.reverse();
  assert.deepEqual(G.defaultSettings().amounts, expected);
});

test('Fisher–Yates assigns each prize once to cases 1–26, using injected or system randomness', () => {
  const cases = G.shuffle(G.FAMILY, seeded(12));
  assert.deepEqual(cases, G.shuffle(G.FAMILY, seeded(12)));
  assert.notDeepEqual(cases, G.FAMILY);
  for (const rng of [undefined,undefined,undefined,seeded(42), () => 0, () => .999999]) {
    const game = G.newGame(G.defaultSettings(), rng);
    assert.deepEqual([...game.cases].sort((a,b) => a-b), G.FAMILY);
    assert.deepEqual(G.remainingNumbers(game), Array.from({length:26}, (_, i) => i + 1));
  }
});

test('amounts accept both exact presets and sort currency inputs without mutating them', () => {
  const classic = [.01,1,5,10,25,50,75,100,200,300,400,500,750,1000,5000,10000,25000,50000,75000,100000,200000,300000,400000,500000,750000,1000000];
  assert.deepEqual(G.CLASSIC, classic);
  for (const preset of [G.FAMILY, classic]) {
    const fields = [...preset].reverse().map(G.formatMoney);
    const original = [...fields];
    assert.deepEqual(G.validateAmounts(fields), {amounts:preset});
    assert.deepEqual(fields, original);
  }
});

test('built-in presets are six named, valid, sorted boards with Family $100 first as the default', () => {
  assert.deepEqual(G.PRESETS.map(p => p.name), ['Family $100', 'Family $100 (Classic)', 'Big Spender $100',
    'Kids $20', 'High Roller $500', 'Classic TV']);
  assert.equal(G.PRESETS[0].amounts, G.FAMILY);
  assert.deepEqual(G.defaultSettings().amounts, G.PRESETS[0].amounts);
  assert.deepEqual(G.FAMILY_CLASSIC, [.01,.05,.10,.25,.50,.75,1,2,3,4,5,6,8,10,12,15,20,25,30,40,50,60,70,75,80,100]);
  assert.deepEqual(G.BIG_SPENDER, [.01,1,5,10,15,20,25,30,35,40,45,50,55,60,65,70,72,75,78,80,85,88,90,94,97,100]);
  assert.deepEqual(G.KIDS, [.01,.05,.10,.25,.50,.75,1,1.5,2,2.5,3,4,5,6,7,8,9,10,11,12,13,14,15,16,18,20]);
  assert.deepEqual(G.HIGH_ROLLER, [.01,1,5,10,20,25,50,75,100,125,150,175,200,225,250,275,300,325,350,375,400,425,450,475,490,500]);
  assert.equal(G.PRESETS[5].amounts, G.CLASSIC);
  const tops = {'Family $100':100, 'Family $100 (Classic)':100, 'Big Spender $100':100, 'Kids $20':20, 'High Roller $500':500, 'Classic TV':1000000};
  for (const {name, amounts} of G.PRESETS) {
    assert.ok(Object.isFrozen(amounts), name);
    assert.deepEqual(G.validateAmounts([...amounts].reverse().map(G.formatMoney)), {amounts:[...amounts]}, name);
    assert.equal(amounts[0], .01, name);
    assert.equal(amounts[25], tops[name], name);
    const game = G.newGame({title:'t', amounts}, seeded(3));
    assert.deepEqual([...game.cases].sort((a,b) => a-b), [...amounts], name);
  }
});

test('amounts reject wrong counts, blanks, duplicates, nonpositive, nonfinite and overprecise entries', () => {
  for (const n of [25, 27]) assert.ok(G.validateAmounts(Array(n).fill(1)).error);
  for (const value of [0, -1, '  ', NaN, Infinity, '.255', '7.000', '1,2', '$2.00', undefined]) {
    const fields = [...G.FAMILY];
    fields[2] = value;
    assert.equal(G.validateAmounts(fields).index, value === '$2.00' ? G.FAMILY.indexOf(2) : 2);
    assert.ok(G.validateAmounts(fields).error);
    assert.throws(() => G.newGame({amounts:fields}), RangeError);
  }
});

test('formatMoney uses cents, thousands separators, and no decimal suffix for whole dollars', () => {
  for (const [n, expected] of [[.01,'$0.01'],[.05,'$0.05'],[.1,'$0.10'],[.25,'$0.25'],[.75,'$0.75'],
    [1,'$1'],[2.5,'$2.50'],[12.75,'$12.75'],[100,'$100'],[1000,'$1,000'],[1000000,'$1,000,000']]) {
    assert.equal(G.formatMoney(n), expected);
  }
});

test('roundNice uses board-appropriate increments at every scale', () => {
  for (const [input, output] of [[.126,.13],[1.07,1.05],[9.96,9.95],[10.8,11],[60.6,61],
    [104,105],[999,1000],[1064,1050],[12345,12500],[674321,674000]]) {
    assert.equal(G.roundNice(input), output);
  }
});

test('offers match clamped EV × round factor × jitter over 900 random remaining boards', () => {
  assert.equal(G.FACTORS.length, 9);
  assert.ok(G.FACTORS[0] >= .40 && G.FACTORS[0] <= .55);
  assert.ok(G.FACTORS[8] >= 1 && G.FACTORS[8] <= 1.15);
  const rng = seeded(713);
  for (let round = 1; round <= 9; round++) {
    if (round > 1) assert.ok(G.FACTORS[round-1] >= G.FACTORS[round-2]);
    for (let i = 0; i < 100; i++) {
      const board = G.shuffle(i % 2 ? G.FAMILY : G.CLASSIC, rng).slice(0, 2 + Math.floor(rng() * 25));
      const ev = board.reduce((sum, n) => sum+n, 0) / board.length;
      for (const r of [0,.5,.999999,rng()]) {
        const offer = G.bankerOffer(board, round, () => r);
        const min = Math.min(...board), max = Math.max(...board);
        assert.ok(offer >= min && offer <= max);
        assert.equal(offer, Math.min(max, Math.max(min, G.roundNice(ev * G.FACTORS[round-1] * (.95 + r * .1)))));
      }
    }
  }
  assert.equal(G.bankerOffer([75,80], 1, neutral), 75);
  assert.equal(G.bankerOffer([99,100], 9, () => .99999), 100);
});

test('Family $100 offers rise round over round on average and never exceed the top remaining case', () => {
  const rng = seeded(2026);
  const sums = Array(9).fill(0);
  const games = 2000;
  for (let g = 0; g < games; g++) {
    const left = G.shuffle(G.FAMILY, rng);
    let pool = left.slice();
    for (let round = 1; round <= 9; round++) {
      pool = pool.slice(G.SCHEDULE[round-1]);
      const offer = G.bankerOffer(pool, round, rng);
      assert.ok(offer <= Math.max(...pool), `round ${round} offer ${offer} > max ${Math.max(...pool)}`);
      assert.ok(offer >= Math.min(...pool));
      sums[round-1] += offer / (pool.reduce((a, b) => a + b, 0) / pool.length);
    }
  }
  const avgRatio = sums.map(s => s / games);
  for (let i = 1; i < 9; i++) assert.ok(avgRatio[i] > avgRatio[i-1], `ratio fell at round ${i+1}: ${avgRatio}`);
  // A late factor above 1 cannot push the offer past the top case.
  assert.equal(G.bankerOffer([0.01, 100], 9, () => .99999), 57);
  assert.equal(G.bankerOffer([90, 100], 9, () => .99999), 100);
  assert.equal(G.bankerOffer([80, 100], 8, neutral), 92);
});

function playUntilOffer(game) {
  const n = G.opensLeft(game);
  const choices = G.remainingNumbers(game).filter(number => number !== game.chosen);
  for (const number of choices.slice(0,n)) {
    game = G.selectCase(game, number);
    assert.equal(game.phase,'reveal');
    game = G.finishReveal(game,neutral);
  }
  assert.equal(game.phase,'call');
  const remaining = G.remainingNumbers(game).map(n => game.cases[n-1]);
  assert.ok(remaining.includes(game.cases[game.chosen-1]));
  assert.equal(game.offers.at(-1).amount,G.bankerOffer(remaining,game.round,neutral));
  return G.showOffer(game);
}

function contestant(chosen = 1) {
  return G.selectCase(G.newGame(G.defaultSettings(), () => .999999), chosen);
}

test('nine rounds open 24 distinct cases and keep or swap pays the correct final pair', () => {
  assert.deepEqual(G.SCHEDULE,[6,5,4,3,2,1,1,1,1]);
  assert.equal(G.SCHEDULE.reduce((sum,n) => sum+n),24);
  let game = contestant();
  for (const [index,count] of G.SCHEDULE.entries()) {
    assert.equal(game.round,index+1);
    assert.equal(G.opensLeft(game),count);
    game = G.decideOffer(playUntilOffer(game), false);
  }
  assert.equal(game.phase,'swap');
  assert.deepEqual(G.remainingNumbers(game), [1,26]);
  assert.equal(game.offers.length, 9);
  assert.ok(game.offers.every(offer => offer.decision === 'no deal'));
  for (const swap of [true,false]) {
    const sealed = G.finishSwap(game,swap);
    assert.equal(sealed.phase,'finalSealed');
    assert.equal(G.revealOtherCase(sealed),sealed);
    assert.equal(G.showResult(sealed),sealed);
    const final = G.openMyCase(sealed);
    assert.equal(final.phase,'finalReveal');
    assert.equal(final.chosen,swap ? 26 : 1);
    assert.equal(final.result.other,swap ? 1 : 26);
    assert.equal(final.result.otherAmount,swap ? .01 : 100);
    assert.equal(final.result.winnings,swap ? 100 : .01);
    assert.equal(final.result.good,swap);
    assert.equal(G.showResult(final),final);
    const other = G.revealOtherCase(final);
    assert.equal(other.phase,'otherReveal');
    assert.equal(G.revealOtherCase(other),other);
    const completed = G.showResult(JSON.parse(JSON.stringify(other)));
    assert.equal(completed.phase,'result');
    assert.deepEqual(completed.result,final.result);
  }
});

test('early and mid-game deals compare the fixed offer with the contestant’s own case', () => {
  for (const chosen of [1,26]) {
    for (const round of [1,5]) {
      let game = contestant(chosen);
      while (game.round < round) game = G.decideOffer(playUntilOffer(game),false);
      const offer = playUntilOffer(game);
      const sealed = G.decideOffer(offer,true);
      assert.equal(sealed.phase,'finalSealed');
      assert.equal(G.showResult(sealed),sealed);
      const final = G.openMyCase(sealed);
      assert.equal(G.revealOtherCase(final),final);
      assert.equal(G.showResult(final).phase,'result');
      assert.equal(final.result.winnings,offer.offers.at(-1).amount);
      assert.equal(final.result.caseValue,game.cases[chosen-1]);
      assert.equal(final.result.good,chosen === 1);
      assert.equal(final.offers.at(-1).decision,'deal');
      assert.equal(final.result.difference,Number((final.result.winnings-final.result.caseValue).toFixed(2)));
    }
  }
  const tied = G.decideOffer({...playUntilOffer(contestant()),offers:[{amount:.01,decision:null}]},true);
  assert.equal(tied.result.good,true);
  assert.equal(tied.result.difference,0);
});

test('money board marks each amount when its case is revealed, including both final cases', () => {
  const reveal = G.selectCase(contestant(), 2);
  assert.equal(reveal.phase, 'reveal');
  assert.deepEqual(G.revealedCaseNumbers(reveal), []);
  assert.deepEqual(G.revealedCaseNumbers(reveal, true), [2]);

  let game = contestant();
  for (const count of G.SCHEDULE) {
    assert.equal(G.opensLeft(game), count);
    game = G.decideOffer(playUntilOffer(game), false);
  }
  for (const swap of [false, true]) {
    const sealed = G.finishSwap(game, swap);
    assert.deepEqual(G.revealedCaseNumbers(sealed, true), game.opened);
    const chosen = G.openMyCase(sealed);
    const first = [...game.opened, chosen.chosen];
    const both = [...first, chosen.result.other];
    assert.deepEqual(G.revealedCaseNumbers(chosen), game.opened);
    assert.deepEqual(G.revealedCaseNumbers(chosen, true), first);
    const other = G.revealOtherCase(chosen);
    assert.deepEqual(G.revealedCaseNumbers(other), first);
    assert.deepEqual(G.revealedCaseNumbers(other, true), both);
    assert.deepEqual(G.revealedCaseNumbers(G.showResult(other)), both);
    assert.equal(new Set(both).size, 26);
  }
  const deal = G.decideOffer(playUntilOffer(contestant()), true);
  assert.deepEqual(G.revealedCaseNumbers(G.showResult(G.openMyCase(deal))), [...deal.opened, deal.chosen]);
});

test('wrong-phase and repeated inputs cannot open the held case or duplicate a transition', () => {
  const game = contestant();
  for (const n of [0,27,1,1.5]) assert.equal(G.selectCase(game,n),game);
  assert.equal(G.finishReveal(game),game);
  assert.equal(G.openMyCase(game),game);
  assert.equal(G.showOffer(game),game);
  assert.equal(G.decideOffer(game,true),game);
  assert.equal(G.finishSwap(game,false),game);
  assert.equal(G.showResult(game),game);
  const reveal = G.selectCase(game,2);
  assert.equal(G.selectCase(reveal,3),reveal);
  const reopened = G.finishReveal(reveal);
  assert.equal(G.selectCase(reopened,2),reopened);
});
