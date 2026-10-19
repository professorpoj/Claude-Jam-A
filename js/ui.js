/*
 * Pocket Parrot interface: the build-your-bird screen, the care screen, the
 * game loop and all the feedback (animations, particles, speech, sounds).
 */
(function () {
  'use strict';

  const D = window.ParrotData;
  const E = window.ParrotEngine;
  const Art = window.ParrotArt;
  const Sound = window.ParrotSound;
  const Store = window.ParrotStore;
  const Bird3D = window.ParrotBird3D;

  const app = document.getElementById('app');
  const $ = (id) => document.getElementById(id);
  const byId = (list, id) => list.find((x) => x.id === id) || null;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MINUS = '−';

  const TICK_MS = 250;
  const LOCAL_SAVE_MS = 10000;
  const TABS = [
    { id: 'feed', label: 'Feed' },
    { id: 'play', label: 'Play' },
    { id: 'train', label: 'Train' },
    { id: 'style', label: 'Style' },
    { id: 'journey', label: 'Journey' },
  ];
  const ANIM_MS = {
    eat: 1300, hop: 950, flap: 1150, wave: 1500, spin: 1300, dance: 2100, shake: 1050, nuzzle: 1350,
    talk: 1000, whistle: 1700, playdead: 2600, loop: 2300, fetch: 1800, stepup: 1500, tilt: 1100, refuse: 700,
  };

  let state = null;
  let draft = null;
  let tab = 'feed';
  let teachText = '';
  let loopTimer = null;
  let lastLocalSave = 0;
  let localOk = true;
  let nextChatterAt = 0;
  let speakingUntil = 0;
  let speechTimer = null;
  let animTimer = null;
  let noteTimer = null;
  let artKey = '';
  let view = null;  // the 3D bird, when WebGL is available and 3D is switched on
  const VIEW_KEY = 'pocket-parrot-view';
  let prefer3d = true;
  try { prefer3d = localStorage.getItem(VIEW_KEY) !== '2d'; } catch (e) { /* storage blocked */ }
  const levelQueue = [];
  let returnFocus = null;
  const shown = {};  // last values written to the DOM, to skip redundant writes

  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  function effectsText(effects) {
    return Object.keys(effects)
      .map((k) => (effects[k] > 0 ? '+' : MINUS) + Math.abs(effects[k]) + ' ' + D.STATS[k].label)
      .join(' · ');
  }

  function backdrop() {
    const leaf = (x, y, r, s, cls) =>
      `<g class="bd-leaf ${cls || ''}" transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><path d="M0 0 C 30 -18, 86 -10, 120 20 C 84 40, 30 34, 0 0 Z"/><path class="bd-rib" d="M0 0 C 40 6, 80 12, 120 20"/></g>`;
    return '<svg class="backdrop" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
      '<circle class="bd-sun" cx="328" cy="62" r="24"/>' +
      '<g class="bd-cloud"><ellipse cx="86" cy="66" rx="34" ry="10"/><ellipse cx="104" cy="58" rx="20" ry="12"/></g>' +
      '<g class="bd-cloud"><ellipse cx="236" cy="40" rx="26" ry="8"/><ellipse cx="248" cy="34" rx="14" ry="9"/></g>' +
      '<path class="bd-hill-back" d="M0 210 C 70 170, 150 190, 210 200 S 340 168, 400 186 V300 H0 Z"/>' +
      '<path class="bd-hill-front" d="M0 246 C 90 220, 170 242, 250 236 S 360 220, 400 232 V300 H0 Z"/>' +
      leaf(-14, -6, 52, 1.05) + leaf(-20, 30, 24, 0.9, 'bd-leaf--b') + leaf(26, -18, 80, 0.8, 'bd-leaf--b') +
      leaf(414, -4, 128, 1.05) + leaf(420, 46, 160, 0.85, 'bd-leaf--b') + leaf(378, -20, 104, 0.7, 'bd-leaf--b') +
      '</svg>';
  }

  // Puts the 3D bird on a stage, or leaves the 2D artwork in place.
  function mountView(stage) {
    if (view) view.dispose();
    view = prefer3d && Bird3D && stage ? Bird3D.mount(stage) : null;
    if (stage) stage.classList.toggle('is-3d', !!view);
  }

  // ---- Build your bird ------------------------------------------------------

  function newDraft() {
    const sp = D.SPECIES[0];
    return { name: 'Kiwi', species: sp.id, colors: Object.assign({}, sp.colors), crest: sp.crest, facePatch: sp.facePatch, personality: 'playful', part: 'head' };
  }

  function draftBird() {
    return E.sanitizeBird(draft);
  }

  function renderCreate() {
    stopLoop();
    state = null;
    draft = draft || newDraft();
    const radio = (name, value, checked) => `<input type="radio" name="${name}" value="${esc(value)}" id="${name}-${esc(value)}"${checked ? ' checked' : ''}>`;

    app.innerHTML = `
      <div class="shell">
        <header class="masthead">
          <p class="wordmark">Pocket <span>Parrot</span></p>
          <p class="masthead-note">A virtual parrot that grows with you</p>
        </header>
        <section class="create" aria-labelledby="create-title">
          <div class="create-preview">
            <div class="stage stage--preview">
              ${backdrop()}
              <div class="bird"><div class="bird-art" id="preview-art"></div></div>
            </div>
            <p class="preview-caption" id="preview-caption"></p>
          </div>
          <form class="create-form" id="create-form" novalidate>
            <div class="create-head">
              <h1 class="display" id="create-title">Build your bird</h1>
              <p class="lede">Pick a species, recolor any feather, then choose a personality. Personality changes which needs drain fastest and what your bird is best at.</p>
            </div>
            <div class="field">
              <label class="field-label" for="bird-name">Name</label>
              <div class="name-row">
                <input id="bird-name" type="text" maxlength="${E.NAME_MAX}" autocomplete="off" spellcheck="false" value="${esc(draft.name)}">
                <button type="button" class="btn btn--quiet" id="suggest-name">Suggest a name</button>
              </div>
            </div>
            <fieldset class="field">
              <legend class="field-label">Species</legend>
              <div class="species-grid">
                ${D.SPECIES.map((sp) => `
                  <label class="species-card">
                    ${radio('species', sp.id, draft.species === sp.id)}
                    <span class="species-dots" aria-hidden="true">${['head', 'body', 'wing', 'tail'].map((p) => `<i style="background:${sp.colors[p]}"></i>`).join('')}</span>
                    <span class="species-name">${sp.name}</span>
                    <span class="species-latin">${sp.latin}</span>
                  </label>`).join('')}
              </div>
            </fieldset>
            <fieldset class="field">
              <legend class="field-label">Feathers</legend>
              <div class="part-row" role="radiogroup" aria-label="Part to color">
                ${D.PARTS.map((p) => `
                  <label class="chip">
                    ${radio('part', p.id, draft.part === p.id)}
                    <i class="chip-dot" data-part-dot="${p.id}" aria-hidden="true"></i>${p.label}
                  </label>`).join('')}
              </div>
              <div class="swatches" id="swatches" role="radiogroup" aria-label="Color"></div>
              <div class="look-row">
                <div class="seg" role="radiogroup" aria-label="Crest">
                  ${D.CREST_STYLES.map((c) => `<label>${radio('crest', c.id, draft.crest === c.id)}<span>${c.label}</span></label>`).join('')}
                </div>
                <label class="check"><input type="checkbox" id="face-patch"${draft.facePatch ? ' checked' : ''}> Bare face patch</label>
              </div>
            </fieldset>
            <fieldset class="field">
              <legend class="field-label">Personality</legend>
              <div class="persona-grid">
                ${D.PERSONALITIES.map((p) => `
                  <label class="persona-card">
                    ${radio('personality', p.id, draft.personality === p.id)}
                    <span class="persona-name">${p.name}</span>
                    <span class="persona-blurb">${p.blurb}</span>
                  </label>`).join('')}
              </div>
            </fieldset>
            <button type="submit" class="btn btn--primary btn--big" id="adopt-btn"></button>
          </form>
        </section>
      </div>`;

    mountView(document.querySelector('.stage--preview'));
    const form = $('create-form');
    form.addEventListener('input', onCreateInput);
    form.addEventListener('change', onCreateInput);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      adopt();
    });
    $('suggest-name').addEventListener('click', () => {
      const options = D.NAMES.filter((n) => n !== draft.name);
      draft.name = options[Math.floor(Math.random() * options.length)];
      $('bird-name').value = draft.name;
      refreshCreate();
    });
    renderSwatches();
    refreshCreate();
  }

  function renderSwatches() {
    const part = byId(D.PARTS, draft.part);
    const current = draft.colors[draft.part];
    const none = part.optional
      ? `<label class="swatch swatch--none" title="None"><input type="radio" name="swatch" value="none" id="swatch-none" aria-label="None"${current === null ? ' checked' : ''}><span></span></label>`
      : '';
    $('swatches').innerHTML = none + D.PALETTE.map((c) => `
      <label class="swatch" title="${c.name}">
        <input type="radio" name="swatch" value="${c.hex}" id="swatch-${c.hex.slice(1)}" aria-label="${c.name}"${current === c.hex ? ' checked' : ''}>
        <span style="background:${c.hex}"></span>
      </label>`).join('');
  }

  function onCreateInput(ev) {
    const t = ev.target;
    if (t.id === 'bird-name') draft.name = t.value;
    else if (t.name === 'species' && t.checked) {
      const sp = byId(D.SPECIES, t.value);
      Object.assign(draft, { species: sp.id, colors: Object.assign({}, sp.colors), crest: sp.crest, facePatch: sp.facePatch });
      $('crest-' + sp.crest).checked = true;
      $('face-patch').checked = sp.facePatch;
      renderSwatches();
    } else if (t.name === 'part' && t.checked) {
      draft.part = t.value;
      renderSwatches();
    } else if (t.name === 'swatch' && t.checked) {
      draft.colors[draft.part] = t.value === 'none' ? null : t.value;
    } else if (t.name === 'crest' && t.checked) draft.crest = t.value;
    else if (t.id === 'face-patch') draft.facePatch = t.checked;
    else if (t.name === 'personality' && t.checked) draft.personality = t.value;
    refreshCreate();
  }

  function refreshCreate() {
    const bird = draftBird();
    const sp = byId(D.SPECIES, bird.species);
    const persona = byId(D.PERSONALITIES, bird.personality);
    if (view) view.setBird(bird, {});
    else $('preview-art').innerHTML = Art.render(bird, {});
    setText($('preview-caption'), `${bird.name} · ${sp.name} · ${persona.name}`);
    setText($('adopt-btn'), `Bring ${bird.name} home`);
    for (const dot of document.querySelectorAll('[data-part-dot]')) {
      const color = bird.colors[dot.dataset.partDot];
      dot.style.background = color || '';
      dot.classList.toggle('is-none', !color);
    }
  }

  function adopt() {
    const now = Date.now();
    state = E.createState(draftBird(), now);
    const sp = byId(D.SPECIES, state.bird.species);
    state.log.unshift({ t: now, text: `${state.bird.name} the ${sp.name} moved in. Welcome home!` });
    draft = null;
    tab = 'feed';
    persist();
    startGame(state);
    say('Hello?');
    Sound.play('chirp');
  }

  // ---- Care screen ----------------------------------------------------------

  function gaugeHtml(id) {
    const label = D.STATS[id].label;
    return `<div class="gauge" data-stat="${id}">
      <span class="gauge-label">${label}</span>
      <span class="gauge-val">0</span>
      <span class="gauge-delta" aria-hidden="true"></span>
      <span class="gauge-track" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100"><span class="gauge-fill"></span></span>
    </div>`;
  }

  function renderGame() {
    for (const k of Object.keys(shown)) delete shown[k];
    artKey = '';
    app.innerHTML = `
      <div class="shell">
        <header class="topbar">
          <p class="wordmark wordmark--sm">Pocket <span>Parrot</span></p>
          <div class="top-actions">
            <button type="button" class="btn btn--quiet btn--sm" id="view-btn" hidden></button>
            <button type="button" class="btn btn--quiet btn--sm" id="sound-btn"></button>
            <button type="button" class="btn btn--quiet btn--sm" id="reset-btn">New bird</button>
          </div>
        </header>
        <div class="confirm" id="confirm" hidden>
          <p id="confirm-text"></p>
          <div class="confirm-actions">
            <button type="button" class="btn btn--quiet" id="confirm-no"></button>
            <button type="button" class="btn btn--danger" id="confirm-yes">Delete and start over</button>
          </div>
        </div>
        <section class="game">
          <div class="game-main">
            <div class="identity">
              <div class="identity-name">
                <h1 class="display bird-name" id="g-name"></h1>
                <p class="identity-meta" id="g-meta"></p>
              </div>
              <div class="level">
                <div class="level-top">
                  <span class="level-badge">Level <b id="g-level"></b></span>
                  <span class="xp-text" id="g-xp"></span>
                </div>
                <span class="xp-track" role="progressbar" aria-label="Experience to next level" aria-valuemin="0" id="g-xpbar"><span class="xp-fill" id="g-xpfill"></span></span>
                <p class="level-note" id="g-mult"></p>
              </div>
            </div>
            <div class="stage" id="stage">
              ${backdrop()}
              <div class="night" aria-hidden="true"></div>
              <div class="bird"><div class="bird-art" id="bird-art"></div><div class="fx" id="fx" aria-hidden="true"></div></div>
              <div class="zzz" aria-hidden="true"><span>z</span><span>z</span><span>Z</span></div>
              <div class="thought" id="thought" aria-hidden="true" hidden></div>
              <div class="bubble" id="bubble" hidden></div>
              <div class="stage-hud">
                <span class="mood" id="g-mood"></span>
                <button type="button" class="btn btn--stage" id="sleep-btn"></button>
              </div>
            </div>
            <div class="stats" id="stats">${D.STAT_IDS.map(gaugeHtml).join('')}</div>
          </div>
          <div class="game-side">
            <div class="tabs" role="tablist" aria-label="Care">
              ${TABS.map((t) => `<button type="button" role="tab" class="tab" id="tab-${t.id}" data-tab="${t.id}" aria-controls="panel">${t.label}</button>`).join('')}
            </div>
            <p class="note" id="note" aria-live="polite"></p>
            <div class="panel" id="panel" role="tabpanel"></div>
            <section class="log" aria-labelledby="log-title">
              <h2 class="section-label" id="log-title">Recent</h2>
              <ol class="log-list" id="log"></ol>
            </section>
          </div>
        </section>
        <footer class="savebar"><span id="save-status"></span></footer>
      </div>
      <div class="overlay" id="levelup" hidden>
        <div class="levelup-card" role="dialog" aria-modal="true" aria-labelledby="lu-title">
          <div class="confetti" id="confetti" aria-hidden="true"></div>
          <p class="eyebrow">Level up</p>
          <h2 class="display lu-title" id="lu-title"></h2>
          <p class="lu-sub" id="lu-sub"></p>
          <ul class="lu-list" id="lu-list"></ul>
          <button type="button" class="btn btn--primary" id="lu-ok">Keep going</button>
        </div>
      </div>`;

    $('view-btn').addEventListener('click', () => {
      prefer3d = !prefer3d;
      try { localStorage.setItem(VIEW_KEY, prefer3d ? '3d' : '2d'); } catch (e) { /* storage blocked */ }
      mountView($('stage'));
      artKey = '';
      $('bird-art').innerHTML = '';
      updateStage(Date.now());
      updateViewBtn();
    });
    $('sound-btn').addEventListener('click', () => {
      Sound.setEnabled(!Sound.isEnabled());
      updateSoundBtn();
      Sound.play('chirp');
    });
    $('reset-btn').addEventListener('click', openConfirm);
    $('confirm-no').addEventListener('click', closeConfirm);
    $('confirm-yes').addEventListener('click', async () => {
      await Store.clear();
      levelQueue.length = 0;
      renderCreate();
      $('bird-name').focus();
    });
    $('sleep-btn').addEventListener('click', () => doAction('sleep'));
    $('lu-ok').addEventListener('click', closeLevelUp);
    $('levelup').addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' || ev.key === 'Tab') {
        ev.preventDefault();
        if (ev.key === 'Escape') closeLevelUp();
      }
    });
    const tabs = document.querySelector('.tabs');
    tabs.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tab]');
      if (b) selectTab(b.dataset.tab);
    });
    tabs.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
      const i = TABS.findIndex((t) => t.id === tab);
      const next = TABS[(i + (ev.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
      selectTab(next.id);
      $('tab-' + next.id).focus();
    });
    $('panel').addEventListener('click', onPanelClick);
    $('panel').addEventListener('submit', onPanelSubmit);
    $('panel').addEventListener('input', (ev) => {
      if (ev.target.id === 'teach-input') teachText = ev.target.value;
    });

    mountView($('stage'));
    updateViewBtn();
    updateSoundBtn();
    selectTab(tab);
    renderLog();
    updateSaveStatus();
  }

  function startGame(s) {
    state = s;
    renderGame();
    const events = E.tick(state, Date.now());
    refresh();
    handleEvents(events);
    scheduleChatter(Date.now());
    startLoop();
  }

  function startLoop() {
    stopLoop();
    loopTimer = setInterval(loop, TICK_MS);
  }

  function stopLoop() {
    clearInterval(loopTimer);
    loopTimer = null;
  }

  function loop() {
    if (!state) return;
    const now = Date.now();
    handleEvents(E.tick(state, now));
    refresh(now);
    if (now - lastLocalSave > LOCAL_SAVE_MS) saveLocal();
    if (now >= nextChatterAt) {
      chatter();
      scheduleChatter(now);
    }
  }

  function scheduleChatter(now) {
    nextChatterAt = now + 16000 + Math.random() * 22000;
  }

  function chatter() {
    if (state.sleeping || Date.now() < speakingUntil || !$('levelup').hidden) return;
    const line = E.idleChatter(state);
    if (!line) return;
    say(line);
    animate('talk');
    Sound.play('chirp');
  }

  function refresh(now) {
    now = now || Date.now();
    updateHeader(now);
    updateStats();
    updateStage(now);
    updateButtons(now);
  }

  function updateHeader(now) {
    const sp = byId(D.SPECIES, state.bird.species);
    const persona = byId(D.PERSONALITIES, state.bird.personality);
    const need = E.xpToNext(state.level);
    const wb = E.wellbeing(state);
    const mult = E.xpMultiplier(state);
    setText($('g-name'), state.bird.name);
    setText($('g-meta'), `${sp.name} · ${persona.name} · Day ${E.daysTogether(state, now)}`);
    setText($('g-level'), String(state.level));
    setText($('g-xp'), `${Math.floor(state.xp)} / ${need} XP`);
    const pct = Math.min(100, (state.xp / need) * 100).toFixed(1) + '%';
    if (shown.xp !== pct) {
      shown.xp = pct;
      $('g-xpfill').style.width = pct;
      const bar = $('g-xpbar');
      bar.setAttribute('aria-valuemax', String(need));
      bar.setAttribute('aria-valuenow', String(Math.floor(state.xp)));
    }
    const thriving = !state.sleeping && wb >= 75;
    setText($('g-mult'), `Well-being ${Math.round(wb)}% · XP ×${mult.toFixed(1)}${thriving ? ' · Thriving, earning bonus XP' : ''}`);
    $('g-mult').classList.toggle('is-thriving', thriving);
  }

  function toneFor(v) {
    if (v >= 60) return 'good';
    if (v >= 30) return 'warn';
    return 'bad';
  }

  function updateStats() {
    for (const id of D.STAT_IDS) {
      const v = Math.round(state.stats[id]);
      if (shown['stat-' + id] === v) continue;
      shown['stat-' + id] = v;
      const g = document.querySelector(`.gauge[data-stat="${id}"]`);
      g.dataset.tone = toneFor(v);
      setText(g.querySelector('.gauge-val'), String(v));
      g.querySelector('.gauge-fill').style.width = v + '%';
      g.querySelector('.gauge-track').setAttribute('aria-valuenow', String(v));
    }
  }

  function updateStage(now) {
    const key = JSON.stringify([state.bird, state.wearing]);
    if (view) {
      view.setBird(state.bird, state.wearing);
      view.setSleeping(state.sleeping);
    } else if (key !== artKey) {
      artKey = key;
      $('bird-art').innerHTML = Art.render(state.bird, state.wearing);
    }
    const stage = $('stage');
    stage.classList.toggle('is-sleeping', state.sleeping);
    const mood = E.mood(state);
    const moodEl = $('g-mood');
    setText(moodEl, mood.label);
    moodEl.dataset.tone = mood.tone;
    setText($('sleep-btn'), state.sleeping ? 'Wake up' : 'Bedtime');
    const thought = $('thought');
    const showNeed = mood.need && !state.sleeping && now >= speakingUntil;
    thought.hidden = !showNeed;
    if (showNeed) setText(thought, D.STATS[mood.need].need);
  }

  function updateButtons(now) {
    for (const el of document.querySelectorAll('#panel [data-cd]')) {
      const [kind, id] = el.dataset.cd.split(':');
      const a = E.availability(state, kind, id, now);
      if (!a || a.locked) continue;
      const busy = a.asleep || a.cooldownLeft > 0;
      const val = busy ? 'true' : 'false';
      if (el.getAttribute('aria-disabled') !== val) el.setAttribute('aria-disabled', val);
      el.style.setProperty('--cd', a.cooldownFrac.toFixed(3));
    }
    const chance = $('train-chance');
    if (chance) setText(chance, Math.round(E.trainChance(state) * 100) + '%');
  }

  function updateViewBtn() {
    const b = $('view-btn');
    // Only offer the switch when this device can show 3D at all.
    b.hidden = !Bird3D || (!view && prefer3d);
    b.setAttribute('aria-pressed', String(!!view));
    setText(b, view ? '3D on' : '3D off');
  }

  function updateSoundBtn() {
    const on = Sound.isEnabled();
    const b = $('sound-btn');
    b.setAttribute('aria-pressed', String(on));
    setText(b, on ? 'Sound on' : 'Sound off');
  }

  function updateSaveStatus() {
    const el = $('save-status');
    if (!el) return;
    let text;
    if (Store.cloudActive()) text = 'Progress saves to your Claude account and this browser.';
    else if (localOk) text = 'Progress saves in this browser.';
    else text = 'This browser is blocking storage, so progress will be lost when you close the page.';
    setText(el, text);
  }

  // ---- Panels -----------------------------------------------------------------

  function selectTab(id) {
    tab = id;
    for (const t of TABS) {
      const b = $('tab-' + t.id);
      b.setAttribute('aria-selected', String(t.id === id));
      b.tabIndex = t.id === id ? 0 : -1;
    }
    $('panel').setAttribute('aria-labelledby', 'tab-' + id);
    renderPanel();
  }

  function renderPanel() {
    const panel = $('panel');
    const focused = document.activeElement && panel.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
    const name = esc(state.bird.name);
    let html = '';
    if (tab === 'feed') html = feedPanel();
    else if (tab === 'play') html = playPanel(name);
    else if (tab === 'train') html = trainPanel();
    else if (tab === 'style') html = stylePanel(name);
    else html = journeyPanel(name);
    panel.innerHTML = html;
    if (focused) {
      const again = panel.querySelector(`[data-focus-key="${focused}"]`);
      if (again) again.focus();
    }
    const input = $('teach-input');
    if (input) input.value = teachText;
    updateButtons(Date.now());
  }

  function actionButton(kind, item, effects, extraMeta) {
    const locked = state.level < item.level;
    const key = `${kind}:${item.id}`;
    let meta = effectsText(effects);
    if (locked) meta = `Unlocks at level ${item.level}${extraMeta ? ' · ' + extraMeta : ''}`;
    return `<button type="button" class="action${locked ? ' is-locked' : ''}" data-act="${kind}" data-id="${item.id}" data-cd="${key}" data-focus-key="${key}"${locked ? ' disabled' : ''}${item.note ? ` title="${esc(item.note)}"` : ''}>
      <span class="action-icon" aria-hidden="true">${item.icon}</span>
      <span class="action-body"><span class="action-name">${item.name}</span><span class="action-meta">${meta}</span></span>
      <span class="action-cd" aria-hidden="true"></span>
    </button>`;
  }

  function feedPanel() {
    return `<p class="panel-intro">Food keeps Fullness up. Fruit and treats lift Happiness too.</p>
      <div class="action-grid">${D.FOODS.map((f) => actionButton('feed', f, f.effects)).join('')}</div>
      <p class="footnote">Avocado and chocolate are toxic to parrots, so they're never on the menu.</p>`;
  }

  function playPanel(name) {
    const reps = E.phraseReps(state);
    let phrases;
    if (E.hasAbility(state, 'mimicry')) {
      const list = state.phrases.map((p) => `
        <li class="phrase${p.learned ? ' is-learned' : ''}">
          <button type="button" class="phrase-text" data-phrase="${esc(p.text)}" title="${p.learned ? 'Say it again' : 'Keep teaching this phrase'}">“${esc(p.text)}”</button>
          <span class="phrase-prog">${p.learned ? 'Learned' : `${p.lessons}/${reps}`}</span>
          <button type="button" class="phrase-x" data-forget="${esc(p.text)}" aria-label="Forget ${esc(p.text)}">×</button>
        </li>`).join('');
      phrases = `<form class="teach" id="teach-form">
          <label class="sr-only" for="teach-input">Phrase to teach</label>
          <input id="teach-input" data-focus-key="teach-input" type="text" maxlength="${E.PHRASE_MAX}" placeholder="Pretty bird!" autocomplete="off">
          <button type="submit" class="btn btn--primary" data-cd="play:talk" data-focus-key="teach">Teach</button>
        </form>
        <p class="muted small">Each lesson is one chat. ${name} needs ${reps} lessons to learn a phrase, then says it in conversation.</p>
        ${list ? `<ul class="phrase-list">${list}</ul>` : ''}`;
    } else {
      phrases = `<p class="muted small">Reach level ${byId(D.ABILITIES, 'mimicry').level} to unlock Mimicry and teach ${name} to talk.</p>`;
    }
    return `<p class="panel-intro">Play lifts Happiness and Bond. Busy toys use Energy, so plan a nap.</p>
      <div class="action-grid">${D.PLAY.map((p) => actionButton('play', p, p.effects, p.ability ? byId(D.ABILITIES, p.ability).name : '')).join('')}</div>
      <section class="phrases" aria-labelledby="phrases-title">
        <h3 class="section-label" id="phrases-title">Phrases</h3>
        ${phrases}
      </section>`;
  }

  function trainPanel() {
    const rows = D.TRICKS.map((t) => {
      const locked = state.level < t.level;
      const m = Math.round(state.tricks[t.id] || 0);
      const mastered = m >= 100;
      const kind = mastered ? 'perform' : 'train';
      const bar = locked ? '' : `<span class="mastery" role="progressbar" aria-label="${t.name} mastery" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${m}"><span style="width:${m}%"></span></span>`;
      return `<li class="trick${locked ? ' is-locked' : ''}${mastered ? ' is-mastered' : ''}">
        <div class="trick-info">
          <p class="trick-name">${t.name}${mastered ? ' <span class="pill pill--good">Mastered</span>' : locked ? '' : ` <span class="trick-pct">${m}%</span>`}</p>
          <p class="trick-note">${locked ? `Unlocks at level ${t.level}` : t.note}</p>
          ${bar}
        </div>
        <button type="button" class="btn ${mastered ? 'btn--primary' : 'btn--secondary'} trick-btn" data-act="${kind}" data-id="${t.id}" data-cd="${kind}:${t.id}" data-focus-key="${kind}:${t.id}"${locked ? ' disabled' : ''}>
          ${locked ? 'Locked' : mastered ? 'Perform' : 'Practice'}<span class="action-cd" aria-hidden="true"></span>
        </button>
      </li>`;
    }).join('');
    return `<p class="panel-intro">Each practice costs 8 Energy. A fed, happy, well-bonded bird learns faster. Success chance right now: <b id="train-chance"></b></p>
      <ul class="trick-list">${rows}</ul>`;
  }

  function stylePanel(name) {
    const slots = D.ACCESSORY_SLOTS.map((slot) => {
      const items = D.ACCESSORIES.filter((a) => a.slot === slot.id).map((a) => {
        const locked = state.level < a.level;
        const on = state.wearing[slot.id] === a.id;
        return `<button type="button" class="wear${on ? ' is-on' : ''}" data-wear="${a.id}" data-focus-key="wear:${a.id}" aria-pressed="${on}"${locked ? ' disabled' : ''}>
          <span class="wear-thumb">${Art.accessoryThumb(a.id)}</span>
          <span class="wear-name">${a.name}</span>
          <span class="wear-meta">${locked ? `Level ${a.level}` : on ? 'Wearing' : 'Try on'}</span>
        </button>`;
      }).join('');
      return `<div class="slot"><h3 class="section-label">${slot.label}</h3><div class="wear-row">${items}</div></div>`;
    }).join('');
    return `<p class="panel-intro">Accessories unlock as ${name} levels up. One per slot.</p>${slots}`;
  }

  function journeyPanel(name) {
    const starter = [...D.FOODS, ...D.PLAY, ...D.TRICKS].filter((x) => x.level === 1).map((x) => ({ kind: 'Starter', name: x.name }));
    let toGo = E.xpToNext(state.level) - state.xp;
    const rows = [];
    for (let level = 1; level <= D.MAX_LEVEL_WITH_UNLOCKS; level += 1) {
      const items = level === 1 ? starter : E.unlocksForLevel(level);
      let status = 'ahead';
      let mark;
      if (level < state.level) { status = 'done'; mark = 'Reached'; }
      else if (level === state.level) { status = 'current'; mark = 'You are here'; }
      else {
        mark = `${Math.ceil(toGo)} XP to go`;
        toGo += E.xpToNext(level);
      }
      rows.push(`<li class="jstep is-${status}">
        <span class="jstep-level">Lv ${level}</span>
        <span class="jstep-items">${items.map((u) => `<span class="tag tag--${u.kind.toLowerCase()}">${u.kind === 'Starter' ? '' : `<b>${u.kind}</b> `}${u.name}</span>`).join('')}</span>
        <span class="jstep-mark">${mark}</span>
      </li>`);
    }
    const days = E.daysTogether(state, Date.now());
    return `<p class="panel-intro">Every level unlocks something new. Keep ${name}'s stats high to level faster: well-being multiplies XP, and a thriving bird earns XP on its own.</p>
      <ol class="journey">${rows.join('')}</ol>
      <dl class="lifetime">
        <div><dt>Total XP</dt><dd>${Math.floor(state.totalXp)}</dd></div>
        <div><dt>Care actions</dt><dd>${state.counts.actions}</dd></div>
        <div><dt>Tricks performed</dt><dd>${state.counts.tricksPerformed}</dd></div>
        <div><dt>Days together</dt><dd>${days}</dd></div>
      </dl>`;
  }

  function onPanelClick(ev) {
    const act = ev.target.closest('[data-act]');
    if (act && !act.disabled) {
      doAction(act.dataset.act, act.dataset.id);
      return;
    }
    const wear = ev.target.closest('[data-wear]');
    if (wear && !wear.disabled) {
      doAction('wear', wear.dataset.wear);
      return;
    }
    const forget = ev.target.closest('[data-forget]');
    if (forget) {
      const r = E.forgetPhrase(state, forget.dataset.forget, Date.now());
      showNote(r.message, !r.ok);
      persist();
      renderPanel();
      const input = $('teach-input');
      if (input) input.focus();
      return;
    }
    const phrase = ev.target.closest('[data-phrase]');
    if (phrase) {
      teachText = phrase.dataset.phrase;
      const input = $('teach-input');
      input.value = teachText;
      input.focus();
    }
  }

  function onPanelSubmit(ev) {
    if (ev.target.id !== 'teach-form') return;
    ev.preventDefault();
    doAction('play', 'talk', { phrase: $('teach-input').value });
  }

  // ---- Actions and feedback ---------------------------------------------------

  function doAction(kind, id, extra) {
    if (!state) return;
    const now = Date.now();
    handleEvents(E.tick(state, now));
    let r;
    if (kind === 'feed') r = E.feed(state, id, now);
    else if (kind === 'play') r = E.play(state, id, now, extra);
    else if (kind === 'train') r = E.practice(state, id, now);
    else if (kind === 'perform') r = E.perform(state, id, now);
    else if (kind === 'sleep') r = E.toggleSleep(state, now);
    else if (kind === 'wear') r = E.wear(state, id, now);
    if (!r) return;

    if (!r.ok) {
      showNote(r.message, true);
      if (r.anim) animate(r.anim);
      if (r.reason !== 'cooldown') Sound.play('fail');
      return;
    }

    showNote(r.message, false);
    if (r.anim) animate(r.anim);
    if (kind === 'feed' && r.fx) foodFx(r.fx);
    else if (r.fx) burst(r.fx, kind === 'perform' ? 6 : 4);
    if (r.xp) floatText(`+${r.xp} XP`);
    flashDeltas(r.deltas);
    if (r.say) say(r.say);
    Sound.play(r.sound);
    if (r.levelUps && r.levelUps.length) queueLevelUps(r.levelUps);
    if (kind === 'play' && extra && extra.phrase != null && r.learned) teachText = '';
    persist();
    refresh(now);
    renderPanel();
    renderLog();
  }

  function handleEvents(events) {
    for (const ev of events) {
      if (ev.type === 'woke') {
        animate('flap');
        showNote(`${state.bird.name} woke up refreshed.`, false);
        Sound.play('chirp');
        renderLog();
      } else if (ev.type === 'passiveXp') {
        floatText(`+${ev.xp} XP`, true);
      } else if (ev.type === 'levelUp') {
        queueLevelUps(ev.levelUps);
        persist();
      } else if (ev.type === 'away') {
        showNote(`Welcome back! You were away for ${formatAway(ev.minutes)}.`, false);
      }
    }
  }

  function formatAway(minutes) {
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
    return 'over a day';
  }

  function showNote(text, bad) {
    const note = $('note');
    if (!note) return;
    note.textContent = text;
    note.classList.toggle('is-bad', !!bad);
    note.classList.add('is-on');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => note.classList.remove('is-on'), 6000);
  }

  function animate(name) {
    const stage = $('stage');
    if (!stage) return;
    stage.removeAttribute('data-anim');
    void stage.offsetWidth;  // restart the CSS animation
    stage.dataset.anim = name;
    if (view) view.play(name);
    clearTimeout(animTimer);
    animTimer = setTimeout(() => stage.removeAttribute('data-anim'), ANIM_MS[name] || 1200);
  }

  function say(text) {
    const bubble = $('bubble');
    if (!bubble) return;
    bubble.hidden = true;
    void bubble.offsetWidth;
    bubble.textContent = text;
    bubble.hidden = false;
    speakingUntil = Date.now() + 3200;
    $('thought').hidden = true;
    clearTimeout(speechTimer);
    speechTimer = setTimeout(() => { bubble.hidden = true; }, 3200);
  }

  function spawn(cls, text, x, y, vars) {
    const fx = $('fx');
    if (!fx) return;
    const el = document.createElement('span');
    el.className = 'fx-item ' + cls;
    el.textContent = text;
    el.style.setProperty('--x', x + '%');
    el.style.setProperty('--y', y + '%');
    for (const k of Object.keys(vars || {})) el.style.setProperty(k, vars[k]);
    fx.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  function burst(icon, count) {
    for (let i = 0; i < count; i += 1) {
      spawn('fx-rise', icon, 38 + Math.random() * 34, 30 + Math.random() * 25, {
        '--dx': (Math.random() * 60 - 30).toFixed(0) + 'px',
        '--rot': (Math.random() * 40 - 20).toFixed(0) + 'deg',
        '--delay': (i * 0.09).toFixed(2) + 's',
      });
    }
  }

  function foodFx(icon) {
    spawn('fx-food', icon, 80, 36, {});
  }

  function floatText(text, soft) {
    spawn('fx-xp' + (soft ? ' fx-xp--soft' : ''), text, 36 + Math.random() * 20, 6 + Math.random() * 8, {});
  }

  function flashDeltas(deltas) {
    for (const id of Object.keys(deltas || {})) {
      const g = document.querySelector(`.gauge[data-stat="${id}"]`);
      if (!g) continue;
      const d = g.querySelector('.gauge-delta');
      const v = deltas[id];
      d.textContent = (v > 0 ? '+' : MINUS) + Math.abs(v);
      d.className = 'gauge-delta is-on ' + (v > 0 ? 'is-up' : 'is-down');
      clearTimeout(d._t);
      d._t = setTimeout(() => { d.className = 'gauge-delta'; }, 1600);
    }
  }

  function renderLog() {
    const list = $('log');
    if (!list) return;
    const now = Date.now();
    list.innerHTML = state.log.slice(0, 8).map((e) => `<li><span class="log-text">${esc(e.text)}</span><time class="log-time">${ago(now - e.t)}</time></li>`).join('');
  }

  function ago(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 45) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  }

  // ---- Level up dialog --------------------------------------------------------

  function queueLevelUps(list) {
    levelQueue.push(...list);
    renderPanel();
    if ($('levelup').hidden) showNextLevelUp();
  }

  function showNextLevelUp() {
    const lu = levelQueue.shift();
    if (!lu) return;
    const overlay = $('levelup');
    if (overlay.hidden) returnFocus = document.activeElement;
    setText($('lu-title'), `Level ${lu.level}!`);
    setText($('lu-sub'), lu.unlocks.length ? `${state.bird.name} unlocked:` : `${state.bird.name} keeps growing. Every level adds to your lifetime XP.`);
    $('lu-list').innerHTML = lu.unlocks.map((u) => `<li><span class="tag tag--${u.kind.toLowerCase()}"><b>${u.kind}</b></span> ${esc(u.name)}</li>`).join('');
    const confetti = $('confetti');
    const colors = Object.values(state.bird.colors).filter(Boolean);
    confetti.innerHTML = Array.from({ length: 18 }, (_, i) =>
      `<i style="--x:${(Math.random() * 100).toFixed(0)}%;--d:${(Math.random() * 0.6).toFixed(2)}s;--r:${(Math.random() * 360).toFixed(0)}deg;background:${colors[i % colors.length]}"></i>`).join('');
    overlay.hidden = false;
    $('lu-ok').focus();
    animate('flap');
    Sound.play('level');
  }

  function closeLevelUp() {
    $('levelup').hidden = true;
    if (levelQueue.length) {
      showNextLevelUp();
      return;
    }
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
    returnFocus = null;
  }

  function openConfirm() {
    const name = state.bird.name;
    setText($('confirm-text'), `Start over with a new bird? ${name}'s level, tricks and phrases will be deleted.`);
    setText($('confirm-no'), `Keep ${name}`);
    $('confirm').hidden = false;
    $('confirm-no').focus();
  }

  function closeConfirm() {
    $('confirm').hidden = true;
    $('reset-btn').focus();
  }

  // ---- Saving -------------------------------------------------------------

  function saveLocal() {
    if (!state) return;
    lastLocalSave = Date.now();
    const ok = Store.saveLocal(state);
    if (ok !== localOk) {
      localOk = ok;
      updateSaveStatus();
    }
  }

  function persist() {
    saveLocal();
    Store.saveCloud(state);
  }

  Store.onChange(updateSaveStatus);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveLocal();
  });
  window.addEventListener('pagehide', saveLocal);
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && $('confirm') && !$('confirm').hidden) closeConfirm();
  });

  // ---- Boot ---------------------------------------------------------------

  async function syncCloud() {
    const ok = await Store.initCloud();
    if (!ok) return;
    const cloud = await Store.loadCloud();
    if (cloud && (!state || cloud.changedAt > state.changedAt + 1000)) {
      startGame(cloud);
      saveLocal();
      showNote(`Loaded ${cloud.bird.name} from your Claude account.`, false);
    } else if (state && (!cloud || state.changedAt > cloud.changedAt)) {
      Store.saveCloud(state);
    }
    updateSaveStatus();
  }

  function boot(data) {
    data = data && typeof data === 'object' ? data : {};
    if (TABS.some((t) => t.id === data.tab)) tab = data.tab;
    const restored = (data.state && E.normalizeState(data.state, Date.now())) || Store.loadLocal();
    if (restored) {
      startGame(restored);
    } else {
      if (data.draft && typeof data.draft === 'object') {
        draft = Object.assign(newDraft(), E.sanitizeBird(data.draft), { part: byId(D.PARTS, data.draft.part) ? data.draft.part : 'head' });
      }
      renderCreate();
    }
    syncCloud();
  }

  // When this page is open in a Claude artifact viewer and gets republished,
  // keep the bird on screen instead of reloading from scratch.
  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function') {
    try { hot.snapshot(() => ({ state, draft, tab })); } catch (e) { /* not supported here */ }
  }
  if (hot && typeof hot.ready === 'function') hot.ready(boot);
  else boot((hot && hot.data) || {});
})();
