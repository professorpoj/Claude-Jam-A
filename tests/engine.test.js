'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/data.js');
const E = require('../js/engine.js');

const T0 = 1_700_000_000_000;
const MIN = 60 * 1000;
const always = () => 0;     // rng that always "succeeds"
const never = () => 0.999;  // rng that always "fails"

function newBird(overrides) {
  return E.createState(Object.assign({ name: 'Kiwi', species: 'scarletMacaw', personality: 'playful' }, overrides), T0);
}

function setStats(state, value) {
  for (const id of D.STAT_IDS) state.stats[id] = value;
}

test('createState sanitizes the bird', () => {
  const s = E.createState({
    name: '  Captain\u0000 Fluffington the Third  ',
    species: 'nope',
    colors: { head: 'red', body: '#00ff00', cheek: null },
    crest: 'mohawk',
    personality: 'evil',
  }, T0);
  assert.equal(s.bird.name, 'Captain Fluffing');
  assert.equal(s.bird.name.length, E.NAME_MAX);
  assert.equal(s.bird.species, 'scarletMacaw');
  assert.equal(s.bird.colors.head, D.SPECIES[0].colors.head);
  assert.equal(s.bird.colors.body, '#00FF00');
  assert.equal(s.bird.colors.cheek, null);
  assert.equal(s.bird.crest, 'none');
  assert.equal(s.bird.personality, 'chatty');
  assert.equal(E.createState({ name: '   ' }, T0).bird.name, 'Kiwi');
});

test('stats drain in real time while awake', () => {
  const s = newBird({ personality: 'cuddly' });
  setStats(s, 80);
  E.tick(s, T0 + MIN);
  assert.equal(s.stats.fullness, 80 - D.DECAY.awake.fullness);
  assert.equal(s.stats.energy, 80 - D.DECAY.awake.energy);
});

test('personality changes drain rates', () => {
  const chill = newBird({ personality: 'chill' });
  const cuddly = newBird({ personality: 'cuddly' });
  setStats(chill, 80);
  setStats(cuddly, 80);
  E.tick(chill, T0 + 10 * MIN);
  E.tick(cuddly, T0 + 10 * MIN);
  assert.ok(chill.stats.energy > cuddly.stats.energy);
  assert.equal(chill.stats.fullness, cuddly.stats.fullness);
});

test('time away drains at half speed and never below the floor', () => {
  const s = newBird();
  setStats(s, 90);
  s.stats.bond = 10;
  const events = E.tick(s, T0 + 10 * 60 * MIN);
  assert.ok(events.some((e) => e.type === 'away'));
  assert.equal(s.stats.fullness, 20);
  assert.equal(s.stats.bond, 10, 'a stat already under the floor does not drop further');

  const short = newBird();
  setStats(short, 90);
  E.tick(short, T0 + 50 * 1000);
  assert.equal(short.stats.fullness, 90 - (50 / 60) * D.DECAY.awake.fullness, 'gaps under a minute drain at full speed');
});

test('sleeping restores energy and wakes the bird when full', () => {
  const s = newBird();
  s.stats.energy = 30;
  assert.equal(E.toggleSleep(s, T0).ok, true);
  assert.equal(s.sleeping, true);
  assert.equal(E.feed(s, 'seeds', T0).reason, 'asleep');
  const events = E.tick(s, T0 + 10 * MIN);
  assert.equal(s.stats.energy, 100);
  assert.equal(s.sleeping, false);
  assert.ok(events.some((e) => e.type === 'woke'));
});

test('a rested bird refuses bedtime', () => {
  const s = newBird();
  s.stats.energy = 95;
  assert.equal(E.toggleSleep(s, T0).reason, 'rested');
});

test('feeding raises fullness, then respects cooldowns and a full belly', () => {
  const s = newBird();
  s.stats.fullness = 40;
  const r = E.feed(s, 'pellets', T0);
  assert.equal(r.ok, true);
  assert.equal(s.stats.fullness, 66);
  assert.equal(r.deltas.fullness, 26);
  assert.ok(r.xp > 0);
  assert.equal(E.feed(s, 'pellets', T0 + 1000).reason, 'cooldown');
  assert.equal(E.feed(s, 'pellets', T0 + 6000).ok, true);
  s.stats.fullness = 96;
  assert.equal(E.feed(s, 'apple', T0 + 7000).reason, 'full');
});

test('locked items cannot be used', () => {
  const s = newBird();
  assert.equal(E.feed(s, 'mango', T0).reason, 'locked');
  assert.equal(E.play(s, 'flight', T0).reason, 'locked');
  assert.equal(E.practice(s, 'loop', T0, { rng: always }).reason, 'locked');
  assert.equal(E.wear(s, 'crown', T0).reason, 'locked');
});

test('higher well-being earns more XP for the same action', () => {
  const happy = newBird();
  const sad = newBird();
  setStats(happy, 95);
  setStats(sad, 20);
  happy.stats.bond = sad.stats.bond = 30;
  assert.ok(E.xpMultiplier(happy) > E.xpMultiplier(sad));
  const a = E.play(happy, 'scratch', T0);
  const b = E.play(sad, 'scratch', T0);
  assert.ok(a.xp > b.xp, `${a.xp} should beat ${b.xp}`);
});

test('thriving birds earn passive XP over time', () => {
  const s = newBird();
  setStats(s, 92);
  const events = E.tick(s, T0 + 45 * 1000);
  assert.equal(s.xp, 6);
  assert.ok(events.some((e) => e.type === 'passiveXp'));

  const meh = newBird();
  setStats(meh, 50);
  E.tick(meh, T0 + 45 * 1000);
  assert.equal(meh.xp, 0);
});

test('levelling up reports unlocks and teaches first words at Mimicry', () => {
  const s = newBird();
  setStats(s, 80);
  let now = T0;
  const levelUps = [];
  while (s.level < 3) {
    now += 6000;
    s.stats.happiness = 50;
    const r = E.play(s, 'bell', now);
    s.stats.energy = 80;
    levelUps.push(...r.levelUps);
  }
  assert.deepEqual(levelUps.map((l) => l.level), [2, 3]);
  const names = levelUps[1].unlocks.map((u) => u.name);
  assert.ok(names.includes('Mimicry'));
  assert.ok(E.hasAbility(s, 'mimicry'));
  assert.deepEqual(s.phrases.map((p) => p.text), ['Hello!', 'Kiwi!']);
});

test('training masters a trick, which can then be performed', () => {
  const s = newBird();
  setStats(s, 80);
  let now = T0;
  let r;
  for (let i = 0; i < 3; i += 1) {
    r = E.practice(s, 'stepup', now, { rng: always });
    assert.equal(r.ok, true);
    assert.equal(r.success, true);
    now += 5000;
    s.stats.energy = 80;
  }
  assert.equal(r.mastered, true);
  assert.equal(s.tricks.stepup, 100);
  assert.equal(E.practice(s, 'stepup', now, { rng: always }).reason, 'mastered');
  const p = E.perform(s, 'stepup', now);
  assert.equal(p.ok, true);
  assert.equal(s.counts.tricksPerformed, 1);
  assert.equal(E.perform(s, 'stepup', now + 1000).reason, 'cooldown');
});

test('failed practice still makes a little progress', () => {
  const s = newBird();
  setStats(s, 80);
  const r = E.practice(s, 'stepup', T0, { rng: never });
  assert.equal(r.success, false);
  assert.equal(s.tricks.stepup, 5);
});

test('hungry or tired birds will not train', () => {
  const s = newBird();
  setStats(s, 80);
  s.stats.fullness = 10;
  assert.equal(E.practice(s, 'stepup', T0, { rng: always }).reason, 'hungry');
  s.stats.fullness = 80;
  s.stats.energy = 5;
  assert.equal(E.practice(s, 'stepup', T0, { rng: always }).reason, 'tired');
});

test('teaching a phrase takes several lessons, fewer for chatty birds', () => {
  for (const [personality, reps] of [['playful', 3], ['chatty', 2]]) {
    const s = newBird({ personality });
    setStats(s, 80);
    assert.equal(E.play(s, 'talk', T0, { phrase: 'Pretty bird' }).reason, 'locked');
    s.level = 3;
    let now = T0;
    let r;
    for (let i = 0; i < reps; i += 1) {
      r = E.play(s, 'talk', now, { phrase: '  Pretty   bird ' });
      now += 5000;
    }
    assert.equal(r.learned, true, personality);
    assert.equal(r.say, 'Pretty bird');
    assert.deepEqual(s.phrases.map((p) => [p.text, p.learned]), [['Pretty bird', true]]);
  }
});

test('saved games survive a JSON round trip and junk is rejected', () => {
  const s = newBird();
  E.feed(s, 'seeds', T0);
  s.tricks.wave = 40;
  s.wearing.head = 'crown';  // not unlocked yet, so it should be dropped
  const restored = E.normalizeState(JSON.parse(JSON.stringify(s)), T0 + 1000);
  assert.equal(restored.bird.name, 'Kiwi');
  assert.equal(restored.stats.fullness, s.stats.fullness);
  assert.equal(restored.tricks.wave, 40);
  assert.equal(restored.wearing.head, null);
  assert.equal(restored.log.length, 1);
  assert.equal(E.normalizeState(null), null);
  assert.equal(E.normalizeState({ version: 99, bird: {} }), null);
  assert.equal(E.normalizeState('nope'), null);
});

test('mood reflects the neediest stat', () => {
  const s = newBird();
  setStats(s, 90);
  assert.equal(E.mood(s).label, 'Ecstatic');
  s.stats.fullness = 10;
  assert.deepEqual(E.mood(s), { label: 'Hungry', tone: 'bad', need: 'fullness' });
  s.sleeping = true;
  assert.equal(E.mood(s).label, 'Asleep');
});

test('every level up to 10 unlocks something', () => {
  for (let level = 2; level <= D.MAX_LEVEL_WITH_UNLOCKS; level += 1) {
    assert.ok(E.unlocksForLevel(level).length > 0, `level ${level}`);
  }
});
