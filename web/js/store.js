// store.js - everything remembered on THIS tablet, in localStorage only.
// No accounts and no names: just where a study was left, notes, and settings.
// Every read/write is wrapped: private browsing or blocked storage must never break the app.

const KEYS = {
  step: 'hr.studyStep',      // { planId, studyKey, index } so a reload resumes the study where it was
  progress: 'hr.planProgress', // { [planId]: { done: [studyKey], last: studyKey, date } }
  notes: 'hr.hymnNotes',     // { [hymnNumber]: 'enjoyed' | 'skip' }   (Sing a Hymn)
  studyNotes: 'hr.studyNotes', // { [planId]: 'enjoyed' | 'skip' }      (Choose a Study)
  settings: 'hr.settings',   // { rate, volume, voiceName }
  last: 'hr.lastStudy',      // { planId, title, studyKey, studyTitle } for the "finished" screen
  itemNotes: 'hr.itemNotes', // { [itemKey]: 'enjoyed' | 'skip' }  (My Day suggestions, games; see engagement.js)
  activity: 'hr.activity',   // { [itemKey]: { type, opened, finished, played } }  counts only, no dates or names
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: carry on */ }
}

function remove(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time

export const store = {
  studyStep: () => read(KEYS.step, { planId: null, studyKey: null, index: 0 }),
  setStudyStep: (s) => write(KEYS.step, s),
  clearStudyStep: () => remove(KEYS.step),

  /** Which studies of a plan this tablet has finished: { done: [studyKey], last, date }. */
  planProgress(planId) {
    const p = read(KEYS.progress, {})[planId];
    return { done: p?.done ?? [], last: p?.last ?? null, date: p?.date ?? null };
  },

  /** A study was finished: tick it in its plan, and remember it for the "finished" screen. */
  finishStudy(planId, planTitle, studyKey, studyTitle) {
    const all = read(KEYS.progress, {});
    const done = new Set(all[planId]?.done ?? []);
    done.add(studyKey);
    all[planId] = { done: [...done], last: studyKey, date: today() };
    write(KEYS.progress, all);
    write(KEYS.last, { planId, title: planTitle, studyKey, studyTitle, date: today() });
    remove(KEYS.step);
  },
  lastStudy: () => read(KEYS.last, { planId: null, title: null, studyKey: null, studyTitle: null, date: null }),

  /** "Start this plan over": clear its ticks on this tablet. */
  resetPlanProgress(planId) {
    const all = read(KEYS.progress, {});
    delete all[planId];
    write(KEYS.progress, all);
  },

  notes: () => read(KEYS.notes, {}),
  setNote(hymnNumber, note) {
    const notes = store.notes();
    if (note) notes[hymnNumber] = note; else delete notes[hymnNumber];
    write(KEYS.notes, notes);
  },

  studyNotes: () => read(KEYS.studyNotes, {}),
  setStudyNote(planId, note) {
    const notes = store.studyNotes();
    if (note) notes[planId] = note; else delete notes[planId];
    write(KEYS.studyNotes, notes);
  },

  /** Notes on any item by its key (e.g. "hymn:12", "scripture:PSA.23.1-4", "trivia:PSA.23.1-4"). */
  itemNotes: () => read(KEYS.itemNotes, {}),
  setItemNote(key, note) {
    const notes = store.itemNotes();
    if (note) notes[key] = note; else delete notes[key];
    write(KEYS.itemNotes, notes);
  },

  /** How often each item was opened / finished / played on this tablet (counts only). */
  activity: () => read(KEYS.activity, {}),
  countActivity(key, type, what) {
    const all = store.activity();
    const a = all[key] ?? { type, opened: 0, finished: 0, played: 0 };
    a[what] = (a[what] ?? 0) + 1;
    all[key] = a;
    // Keep it small: only the 60 most recently touched items (insertion order = recency).
    delete all[key];
    all[key] = a;
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 60))) delete all[k];
    write(KEYS.activity, all);
  },

  /** Aide tools "Reset notes": clears hymn, study and item notes, and the activity counts. */
  resetNotes() { remove(KEYS.notes); remove(KEYS.studyNotes); remove(KEYS.itemNotes); remove(KEYS.activity); },

  // readAloud: off by default in studies (built-in voices still sound robotic); the aide can turn it on.
  // showReasons: Aide tools' "Show AI reasoning" (why each suggestion was picked), off by default.
  settings: () => read(KEYS.settings, { rate: 'slow', volume: 0.8, voiceName: null, readAloud: false, showReasons: false }),
  setSettings: (changes) => write(KEYS.settings, { ...store.settings(), ...changes }),
};
