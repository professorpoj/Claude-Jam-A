/*
 * Parrot Pal saving. Always keeps a copy in this browser's localStorage.
 * When the page runs as a published Claude artifact, it also saves to the
 * viewer's private space in the artifact's database, so the bird follows
 * them to other devices. Anywhere else (a local file, GitHub Pages) the
 * cloud half simply stays off.
 */
(function (root) {
  'use strict';

  const E = root.ParrotEngine;
  const KEY = 'parrot-pal-save-v1';
  const CLOUD_DELAY_MS = 3000;

  let ref = null;
  let timer = null;
  let writing = false;
  let pending = null;
  let retried = false;
  const listeners = [];

  const notify = () => listeners.forEach((fn) => fn());

  function dropCloud() {
    ref = null;
    pending = null;
    clearTimeout(timer);
    notify();
  }

  async function flush() {
    if (!ref || writing || !pending) return;
    const body = { state: JSON.parse(JSON.stringify(pending)), savedAt: Date.now() };
    pending = null;
    writing = true;
    try {
      await ref.set(body);
      retried = false;
    } catch (e) {
      if (e && e.code === 'unavailable' && !retried) {
        retried = true;
        pending = pending || body.state;
        setTimeout(flush, 1500 + Math.random() * 2000);
      } else {
        dropCloud();
      }
    } finally {
      writing = false;
      if (pending && !timer) timer = setTimeout(() => { timer = null; flush(); }, CLOUD_DELAY_MS);
    }
  }

  root.ParrotStore = {
    onChange(fn) { listeners.push(fn); },

    cloudActive: () => !!ref,

    loadLocal() {
      try {
        const raw = root.localStorage.getItem(KEY);
        return raw ? E.normalizeState(JSON.parse(raw), Date.now()) : null;
      } catch (e) {
        return null;
      }
    },

    saveLocal(state) {
      try {
        root.localStorage.setItem(KEY, JSON.stringify(state));
        return true;
      } catch (e) {
        return false;
      }
    },

    // Resolves true when per-viewer cloud saves are available on this page.
    async initCloud() {
      const claude = root.claude;
      if (!claude || typeof claude.use !== 'function') return false;
      try {
        const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
        if (!db || !user) return false;
        const id = await user.id();
        if (!id) return false;
        ref = db.doc('data/users/' + id + '/save');
        notify();
        return true;
      } catch (e) {
        return false;
      }
    },

    async loadCloud() {
      if (!ref) return null;
      try {
        const snap = await ref.get();
        if (!snap.exists) return null;
        const body = snap.data();
        return E.normalizeState(body && body.state, Date.now());
      } catch (e) {
        if (!e || e.code !== 'unavailable') dropCloud();
        return null;
      }
    },

    // Coalesces bursts of actions into one write every few seconds.
    saveCloud(state) {
      if (!ref) return;
      pending = state;
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; flush(); }, CLOUD_DELAY_MS);
    },

    async clear() {
      try { root.localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
      clearTimeout(timer);
      timer = null;
      pending = null;
      if (ref) {
        try { await ref.delete(); } catch (e) { /* nothing saved yet */ }
      }
    },
  };
})(window);
