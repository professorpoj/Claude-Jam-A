/*
 * Parrot Pal rules engine. Pure game logic with no DOM access, so it runs in
 * the browser and under Node for tests. Functions mutate the state object
 * they are given and return a result describing what happened, which the UI
 * turns into animations, sounds and messages.
 */
(function (root) {
  'use strict';

  const D = root.ParrotData || (typeof require === 'function' ? require('./data.js') : null);

  const SAVE_VERSION = 1;
  const OFFLINE_GAP_MS = 60 * 1000;          // a longer gap between ticks counts as "away"
  const MAX_OFFLINE_MS = 24 * 60 * 60 * 1000;
  const OFFLINE_RATE = 0.5;                  // stats drain at half speed while you're away
  const OFFLINE_FLOOR = 20;                  // and never drop below this while you're away
  const PASSIVE_XP_MS = 15 * 1000;
  const THRIVING = 75;                       // well-being needed for passive XP
  const TRAIN_COOLDOWN = 5;
  const PERFORM_COOLDOWN = 12;
  const LOG_LIMIT = 12;
  const MAX_PHRASES = 12;
  const NAME_MAX = 16;
  const PHRASE_MAX = 32;
  const HEX = /^#[0-9a-f]{6}$/i;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const byId = (list, id) => list.find((item) => item.id === id) || null;
  const pick = (list, rng) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  const lower = (s) => s.toLowerCase();

  function cleanText(value, max) {
    const s = String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return Array.from(s).slice(0, max).join('');
  }

  const cleanName = (name) => cleanText(name, NAME_MAX) || 'Kiwi';
  const cleanPhrase = (text) => cleanText(text, PHRASE_MAX);

  function sanitizeBird(raw) {
    raw = raw || {};
    const species = byId(D.SPECIES, raw.species) || D.SPECIES[0];
    const colors = {};
    for (const part of D.PARTS) {
      const value = raw.colors ? raw.colors[part.id] : undefined;
      if (part.optional && value === null) colors[part.id] = null;
      else if (typeof value === 'string' && HEX.test(value)) colors[part.id] = value.toUpperCase();
      else colors[part.id] = species.colors[part.id];
    }
    return {
      name: cleanName(raw.name),
      species: species.id,
      colors,
      crest: byId(D.CREST_STYLES, raw.crest) ? raw.crest : species.crest,
      facePatch: typeof raw.facePatch === 'boolean' ? raw.facePatch : species.facePatch,
      personality: byId(D.PERSONALITIES, raw.personality) ? raw.personality : D.PERSONALITIES[0].id,
    };
  }

  function createState(bird, now) {
    return {
      version: SAVE_VERSION,
      bird: sanitizeBird(bird),
      stats: { fullness: 75, happiness: 70, bond: 40, energy: 85, plumage: 80 },
      level: 1,
      xp: 0,
      totalXp: 0,
      sleeping: false,
      tricks: {},
      phrases: [],
      wearing: { head: null, face: null, neck: null },
      cooldowns: {},
      log: [],
      counts: { actions: 0, tricksPerformed: 0 },
      passiveMs: 0,
      createdAt: now,
      updatedAt: now,  // last time stats were advanced by tick()
      changedAt: now,  // last time the player did something (used to pick the newest save)
    };
  }

  // Rebuilds a state from saved JSON, dropping anything malformed.
  function normalizeState(raw, now) {
    if (!raw || typeof raw !== 'object' || raw.version !== SAVE_VERSION || !raw.bird) return null;
    now = num(now, Date.now());
    const s = createState(raw.bird, Math.min(num(raw.createdAt, now), now));
    const stats = raw.stats || {};
    for (const id of D.STAT_IDS) s.stats[id] = clamp(num(stats[id], s.stats[id]), 0, 100);
    s.level = Math.max(1, Math.floor(num(raw.level, 1)));
    s.xp = Math.max(0, num(raw.xp, 0));
    s.totalXp = Math.max(s.xp, num(raw.totalXp, 0));
    s.sleeping = raw.sleeping === true;
    for (const t of D.TRICKS) {
      const m = raw.tricks ? raw.tricks[t.id] : undefined;
      if (typeof m === 'number' && m > 0) s.tricks[t.id] = clamp(m, 0, 100);
    }
    if (Array.isArray(raw.phrases)) {
      for (const p of raw.phrases) {
        const text = cleanPhrase(p && p.text);
        if (!text || s.phrases.some((q) => lower(q.text) === lower(text))) continue;
        s.phrases.push({ text, lessons: Math.max(0, Math.floor(num(p.lessons, 0))), learned: p.learned === true });
        if (s.phrases.length >= MAX_PHRASES) break;
      }
    }
    const wearing = raw.wearing || {};
    for (const slot of D.ACCESSORY_SLOTS) {
      const acc = byId(D.ACCESSORIES, wearing[slot.id]);
      s.wearing[slot.id] = acc && acc.slot === slot.id && s.level >= acc.level ? acc.id : null;
    }
    if (raw.cooldowns && typeof raw.cooldowns === 'object') {
      for (const key of Object.keys(raw.cooldowns)) {
        const cd = raw.cooldowns[key];
        if (cd && num(cd.until, 0) > now && num(cd.ms, 0) > 0) s.cooldowns[key] = { until: cd.until, ms: cd.ms };
      }
    }
    if (Array.isArray(raw.log)) {
      s.log = raw.log
        .filter((e) => e && typeof e.text === 'string')
        .slice(0, LOG_LIMIT)
        .map((e) => ({ t: num(e.t, now), text: cleanText(e.text, 160) }));
    }
    const counts = raw.counts || {};
    s.counts = { actions: Math.max(0, num(counts.actions, 0)), tricksPerformed: Math.max(0, num(counts.tricksPerformed, 0)) };
    s.passiveMs = clamp(num(raw.passiveMs, 0), 0, PASSIVE_XP_MS);
    s.updatedAt = Math.min(num(raw.updatedAt, now), now);
    s.changedAt = Math.min(num(raw.changedAt, s.updatedAt), now);
    return s;
  }

  // ---- Derived values ------------------------------------------------------

  const personality = (state) => byId(D.PERSONALITIES, state.bird.personality) || {};

  function decayRate(state, stat) {
    const base = (state.sleeping ? D.DECAY.asleep : D.DECAY.awake)[stat];
    if (base <= 0) return base;
    const decay = personality(state).decay;
    return base * (decay && decay[stat] != null ? decay[stat] : 1);
  }

  function wellbeing(state) {
    let total = 0;
    for (const id of D.STAT_IDS) total += state.stats[id];
    return total / D.STAT_IDS.length;
  }

  // Well-being turns into an XP multiplier from x0.5 (miserable) to x1.5 (thriving).
  const xpMultiplier = (state) => Math.round((0.5 + wellbeing(state) / 100) * 10) / 10;

  const xpToNext = (level) => 40 + 35 * (level - 1);

  const phraseReps = (state) => personality(state).phraseReps || 3;

  function hasAbility(state, id) {
    const ability = byId(D.ABILITIES, id);
    return !!ability && state.level >= ability.level;
  }

  function trainChance(state) {
    const s = state.stats;
    const focus = (s.happiness + s.bond + s.fullness) / 3 / 100;
    return clamp(0.3 + 0.6 * focus + (personality(state).trainBonus || 0), 0.15, 0.95);
  }

  function mood(state) {
    if (state.sleeping) return { label: 'Asleep', tone: 'calm', need: null };
    let lowest = D.STAT_IDS[0];
    for (const id of D.STAT_IDS) if (state.stats[id] < state.stats[lowest]) lowest = id;
    const low = state.stats[lowest];
    if (low < 25) return { label: D.STATS[lowest].low, tone: 'bad', need: lowest };
    const need = low < 45 ? lowest : null;
    const wb = wellbeing(state);
    if (wb >= 85) return { label: 'Ecstatic', tone: 'good', need };
    if (wb >= 70) return { label: 'Happy', tone: 'good', need };
    if (wb >= 50) return { label: 'Content', tone: 'ok', need };
    return { label: 'Grumpy', tone: 'warn', need };
  }

  const daysTogether = (state, now) => Math.floor(Math.max(0, now - state.createdAt) / 86400000) + 1;

  function unlocksForLevel(level) {
    const out = [];
    for (const f of D.FOODS) if (f.level === level) out.push({ kind: 'Food', name: f.name });
    for (const p of D.PLAY) if (p.level === level && !p.ability) out.push({ kind: 'Activity', name: p.name });
    for (const a of D.ABILITIES) if (a.level === level) out.push({ kind: 'Ability', name: a.name });
    for (const t of D.TRICKS) if (t.level === level) out.push({ kind: 'Trick', name: t.name });
    for (const c of D.ACCESSORIES) if (c.level === level) out.push({ kind: 'Accessory', name: c.name });
    return out;
  }

  // ---- Bookkeeping ---------------------------------------------------------

  function log(state, now, text) {
    state.log.unshift({ t: now, text });
    if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT;
  }

  function learnPhraseNow(state, text) {
    const clean = cleanPhrase(text);
    if (!clean || state.phrases.some((p) => lower(p.text) === lower(clean))) return;
    if (state.phrases.length >= MAX_PHRASES) return;
    state.phrases.push({ text: clean, lessons: phraseReps(state), learned: true });
  }

  function addXp(state, amount) {
    const levelUps = [];
    if (!(amount > 0)) return levelUps;
    state.xp += amount;
    state.totalXp += amount;
    while (state.xp >= xpToNext(state.level)) {
      state.xp -= xpToNext(state.level);
      state.level += 1;
      levelUps.push({ level: state.level, unlocks: unlocksForLevel(state.level) });
      if (state.level === byId(D.ABILITIES, 'mimicry').level) {
        // Parrots usually pick up a greeting and their own name first.
        learnPhraseNow(state, 'Hello!');
        learnPhraseNow(state, state.bird.name + '!');
      }
    }
    return levelUps;
  }

  // XP from an action, scaled by well-being at the moment of the action.
  function award(state, base) {
    if (!(base > 0)) return { xp: 0, levelUps: [] };
    const xp = Math.max(1, Math.round(base * xpMultiplier(state)));
    return { xp, levelUps: addXp(state, xp) };
  }

  function applyEffects(state, effects, tags) {
    const mods = personality(state);
    const deltas = {};
    for (const stat of Object.keys(effects)) {
      let d = effects[stat];
      if (d > 0) {
        if (mods.statGain && mods.statGain[stat]) d *= mods.statGain[stat];
        for (const tag of tags || []) if (mods.tagGain && mods.tagGain[tag]) d *= mods.tagGain[tag];
      }
      const before = state.stats[stat];
      state.stats[stat] = clamp(before + d, 0, 100);
      const change = Math.round(state.stats[stat] - before);
      if (change) deltas[stat] = change;
    }
    return deltas;
  }

  function cooldownLeft(state, key, now) {
    const cd = state.cooldowns[key];
    return cd ? Math.max(0, cd.until - now) : 0;
  }

  function startCooldown(state, key, seconds, now) {
    state.cooldowns[key] = { until: now + seconds * 1000, ms: seconds * 1000 };
  }

  function fail(reason, message, extra) {
    return Object.assign({ ok: false, reason, message }, extra);
  }

  function done(state, now, fields) {
    state.changedAt = now;
    state.counts.actions += 1;
    if (fields.message) log(state, now, fields.message);
    return Object.assign({ ok: true, deltas: {}, xp: 0, levelUps: [], anim: null, fx: null, say: null, sound: 'chirp' }, fields);
  }

  function gate(state, level, key, now) {
    if (state.level < level) return fail('locked', `Reach level ${level} to unlock this.`);
    if (state.sleeping) return fail('asleep', `Shh, ${state.bird.name} is asleep.`);
    const left = cooldownLeft(state, key, now);
    if (left > 0) return fail('cooldown', `Ready again in ${Math.ceil(left / 1000)}s.`);
    return null;
  }

  // What the UI needs to draw a button: locked, asleep, or cooling down.
  function availability(state, kind, id, now) {
    let item;
    let key;
    if (kind === 'feed') { item = byId(D.FOODS, id); key = 'feed:' + id; }
    else if (kind === 'play') { item = byId(D.PLAY, id); key = 'play:' + id; }
    else if (kind === 'train') { item = byId(D.TRICKS, id); key = 'train'; }
    else if (kind === 'perform') { item = byId(D.TRICKS, id); key = 'perform:' + id; }
    if (!item) return null;
    const left = cooldownLeft(state, key, now);
    const cd = state.cooldowns[key];
    return {
      locked: state.level < item.level,
      level: item.level,
      asleep: state.sleeping,
      cooldownLeft: left,
      cooldownFrac: left > 0 && cd ? left / cd.ms : 0,
    };
  }

  // ---- Time ----------------------------------------------------------------

  function tick(state, now) {
    const events = [];
    let dt = now - state.updatedAt;
    if (!(dt > 0)) {
      state.updatedAt = Math.min(state.updatedAt, now);
      return events;
    }
    const away = dt > OFFLINE_GAP_MS;
    if (away) dt = Math.min(dt, MAX_OFFLINE_MS);
    const minutes = dt / 60000;

    for (const id of D.STAT_IDS) {
      const rate = decayRate(state, id);
      const before = state.stats[id];
      let next = before - rate * minutes * (away && rate > 0 ? OFFLINE_RATE : 1);
      if (away && rate > 0) next = Math.max(next, Math.min(before, OFFLINE_FLOOR));
      state.stats[id] = clamp(next, 0, 100);
    }

    if (state.sleeping && state.stats.energy >= 100) {
      state.sleeping = false;
      log(state, now, `${state.bird.name} wakes up refreshed.`);
      events.push({ type: 'woke' });
    }

    if (!away && !state.sleeping && wellbeing(state) >= THRIVING) {
      state.passiveMs += dt;
      let gained = 0;
      while (state.passiveMs >= PASSIVE_XP_MS) {
        state.passiveMs -= PASSIVE_XP_MS;
        gained += wellbeing(state) >= 90 ? 2 : 1;
      }
      if (gained) {
        const levelUps = addXp(state, gained);
        events.push({ type: 'passiveXp', xp: gained });
        if (levelUps.length) events.push({ type: 'levelUp', levelUps });
      }
    } else {
      state.passiveMs = 0;
    }

    if (away) events.push({ type: 'away', minutes: Math.round(minutes) });
    state.updatedAt = now;
    return events;
  }

  // ---- Actions -------------------------------------------------------------

  function feed(state, foodId, now) {
    const food = byId(D.FOODS, foodId);
    if (!food) return fail('unknown', 'That food is not on the menu.');
    const key = 'feed:' + food.id;
    const blocked = gate(state, food.level, key, now);
    if (blocked) return blocked;
    const name = state.bird.name;
    if (state.stats.fullness >= 95) {
      return fail('full', `${name} turns away from the ${lower(food.name)}. Not hungry right now.`, { anim: 'refuse' });
    }
    const reward = award(state, food.xp);
    const deltas = applyEffects(state, food.effects, []);
    startCooldown(state, key, food.cooldown, now);
    return done(state, now, {
      message: `${name} munches the ${lower(food.name)}.`,
      deltas, xp: reward.xp, levelUps: reward.levelUps, anim: 'eat', fx: food.icon, sound: 'eat',
    });
  }

  function chatReply(state, rng) {
    const learned = state.phrases.filter((p) => p.learned);
    if (hasAbility(state, 'mimicry') && learned.length && rng() < 0.7) return pick(learned, rng).text;
    return pick(D.SQUAWKS, rng);
  }

  function play(state, actionId, now, opts) {
    opts = opts || {};
    const action = byId(D.PLAY, actionId);
    if (!action) return fail('unknown', 'Unknown activity.');
    const key = 'play:' + action.id;
    const blocked = gate(state, action.level, key, now);
    if (blocked) return blocked;
    const name = state.bird.name;
    const cost = -(action.effects.energy || 0);
    if (cost > 0 && state.stats.energy < cost + 5) {
      return fail('tired', `${name} is too tired for that. Try bedtime.`, { anim: 'refuse' });
    }
    const rng = opts.rng || Math.random;
    if (action.id === 'talk' && opts.phrase != null) return teach(state, action, key, now, opts.phrase);

    const gains = Object.keys(action.effects).filter((s) => action.effects[s] > 0);
    const saturated = gains.length > 0 && gains.every((s) => state.stats[s] >= 97);
    const reward = award(state, saturated ? 1 : action.xp);
    const deltas = applyEffects(state, action.effects, action.tags);
    startCooldown(state, key, action.cooldown, now);
    return done(state, now, {
      message: saturated ? `${name} is already as content as a bird can be.` : action.msg.replace('{name}', name),
      deltas, xp: reward.xp, levelUps: reward.levelUps, anim: action.anim, fx: action.fx,
      say: action.id === 'talk' ? chatReply(state, rng) : null,
      sound: action.id === 'music' ? 'music' : 'chirp',
    });
  }

  function teach(state, action, key, now, text) {
    const name = state.bird.name;
    const mimicry = byId(D.ABILITIES, 'mimicry');
    if (!hasAbility(state, 'mimicry')) return fail('locked', `Reach level ${mimicry.level} to teach phrases.`);
    const phrase = cleanPhrase(text);
    if (!phrase) return fail('empty', 'Type a phrase to teach first.');
    let entry = state.phrases.find((p) => lower(p.text) === lower(phrase));
    if (!entry) {
      if (state.phrases.length >= MAX_PHRASES) {
        return fail('full', `${name} already knows ${MAX_PHRASES} phrases. Forget one to make room.`);
      }
      entry = { text: phrase, lessons: 0, learned: false };
      state.phrases.push(entry);
    }

    let bonus = 0;
    let message;
    let say;
    if (entry.learned) {
      message = `${name} says "${entry.text}" right back at you.`;
      say = entry.text;
    } else {
      entry.lessons += 1;
      const reps = phraseReps(state);
      if (entry.lessons >= reps) {
        entry.learned = true;
        bonus = 10;
        message = `${name} learned to say "${entry.text}"!`;
        say = entry.text;
      } else {
        message = `${name} listens closely. Lesson ${entry.lessons} of ${reps}.`;
        const chars = Array.from(entry.text);
        say = chars.slice(0, Math.max(1, Math.ceil((chars.length * entry.lessons) / (reps + 1)))).join('') + '…?';
      }
    }
    const reward = award(state, action.xp + bonus);
    const deltas = applyEffects(state, action.effects, action.tags);
    startCooldown(state, key, action.cooldown, now);
    return done(state, now, {
      message, deltas, xp: reward.xp, levelUps: reward.levelUps, anim: 'talk', fx: action.fx, say,
      learned: bonus > 0,
    });
  }

  function forgetPhrase(state, text, now) {
    const i = state.phrases.findIndex((p) => p.text === text);
    if (i < 0) return fail('unknown', 'That phrase was not found.');
    state.phrases.splice(i, 1);
    state.changedAt = now;
    return { ok: true, message: `${state.bird.name} forgot "${text}".` };
  }

  function practice(state, trickId, now, opts) {
    opts = opts || {};
    const trick = byId(D.TRICKS, trickId);
    if (!trick) return fail('unknown', 'Unknown trick.');
    const blocked = gate(state, trick.level, 'train', now);
    if (blocked) return blocked;
    const name = state.bird.name;
    const mastery = state.tricks[trick.id] || 0;
    if (mastery >= 100) return fail('mastered', `${name} already knows ${trick.name}. Perform it instead.`);
    if (state.stats.energy < 10) return fail('tired', `${name} is too tired to train. Try bedtime.`, { anim: 'refuse' });
    if (state.stats.fullness < 15) return fail('hungry', `${name} is too hungry to focus. Offer some food first.`, { anim: 'refuse' });

    const rng = opts.rng || Math.random;
    const chance = trainChance(state);
    const success = rng() < chance;
    const gain = success ? Math.round((34 / trick.difficulty) * (personality(state).masteryMult || 1)) : 5;
    const next = Math.min(100, mastery + gain);
    state.tricks[trick.id] = next;
    const mastered = next >= 100;

    const reward = award(state, (success ? Math.round(8 * trick.difficulty) : 2) + (mastered ? 15 : 0));
    const deltas = applyEffects(state, success ? { happiness: 3, bond: 3, energy: -8 } : { happiness: -2, energy: -8 }, []);
    startCooldown(state, 'train', TRAIN_COOLDOWN, now);
    let message;
    if (mastered) message = `${name} mastered ${trick.name}! Perform it any time.`;
    else if (success) message = `Nailed it! ${trick.name} is coming along.`;
    else message = `${name} got distracted by something shiny. Keep practicing.`;
    return done(state, now, {
      message, deltas, xp: reward.xp, levelUps: reward.levelUps,
      anim: success ? trick.anim : 'tilt', fx: success ? '⭐' : '❔',
      sound: success ? 'chirp' : 'fail', success, mastered, chance,
    });
  }

  function perform(state, trickId, now) {
    const trick = byId(D.TRICKS, trickId);
    if (!trick) return fail('unknown', 'Unknown trick.');
    const key = 'perform:' + trick.id;
    const blocked = gate(state, trick.level, key, now);
    if (blocked) return blocked;
    const name = state.bird.name;
    if ((state.tricks[trick.id] || 0) < 100) return fail('unlearned', `${name} hasn't mastered ${trick.name} yet.`);
    if (state.stats.energy < 6) return fail('tired', `${name} is too tired to perform. Try bedtime.`, { anim: 'refuse' });
    const reward = award(state, Math.round(5 + 3 * trick.difficulty));
    const deltas = applyEffects(state, { happiness: 8, bond: 5, energy: -5 }, []);
    startCooldown(state, key, PERFORM_COOLDOWN, now);
    state.counts.tricksPerformed += 1;
    return done(state, now, {
      message: `${name} performs ${trick.name}. Bravo!`,
      deltas, xp: reward.xp, levelUps: reward.levelUps, anim: trick.anim, fx: '👏',
      sound: trick.id === 'whistle' ? 'whistle' : 'chirp',
    });
  }

  function toggleSleep(state, now) {
    const name = state.bird.name;
    if (state.sleeping) {
      state.sleeping = false;
      return done(state, now, { message: `${name} wakes up and stretches.`, anim: 'flap' });
    }
    if (state.stats.energy >= 90) return fail('rested', `${name} isn't sleepy yet.`, { anim: 'refuse' });
    state.sleeping = true;
    return done(state, now, { message: `You cover the cage. ${name} tucks in for a nap.`, sound: 'sleep' });
  }

  function wear(state, accessoryId, now) {
    const acc = byId(D.ACCESSORIES, accessoryId);
    if (!acc) return fail('unknown', 'Unknown accessory.');
    if (state.level < acc.level) return fail('locked', `Reach level ${acc.level} to unlock this.`);
    const name = state.bird.name;
    const removing = state.wearing[acc.slot] === acc.id;
    state.wearing[acc.slot] = removing ? null : acc.id;
    return done(state, now, {
      message: removing ? `${name} takes off the ${lower(acc.name)}.` : `${name} tries on the ${lower(acc.name)}. Looking sharp.`,
      anim: removing ? null : 'hop', sound: 'chirp',
    });
  }

  function idleChatter(state, rng) {
    rng = rng || Math.random;
    if (state.sleeping) return null;
    return chatReply(state, rng);
  }

  const api = {
    SAVE_VERSION, MAX_PHRASES, NAME_MAX, PHRASE_MAX,
    createState, normalizeState, sanitizeBird, cleanName, cleanPhrase,
    tick, feed, play, practice, perform, toggleSleep, wear, forgetPhrase, idleChatter,
    wellbeing, xpMultiplier, xpToNext, trainChance, mood, availability, hasAbility,
    phraseReps, unlocksForLevel, daysTogether, decayRate,
  };

  root.ParrotEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
