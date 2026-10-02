// store.js - everything remembered on THIS tablet, in localStorage only.
// No accounts and no names: just where a study was left, notes, and settings.
// Every read/write is wrapped: private browsing or blocked storage must never break the app.

const KEYS = {
  step: 'hr.studyStep',      // { planId, index } so a reload resumes the study where it was
  notes: 'hr.hymnNotes',     // { [hymnNumber]: 'enjoyed' | 'skip' }   (Sing a Hymn)
  studyNotes: 'hr.studyNotes', // { [planId]: 'enjoyed' | 'skip' }      (Choose a Study)
  settings: 'hr.settings',   // { rate, volume, voiceName }
  last: 'hr.lastStudy',      // { planId, title } for the "finished" screen and "Last time" tag
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
  studyStep: () => read(KEYS.step, { planId: null, index: 0 }),
  setStudyStep: (s) => write(KEYS.step, s),
  clearStudyStep: () => remove(KEYS.step),

  /** A study was finished: remember it for the "finished" screen and the "Last time" tag. */
  finishStudy(planId, title) {
    write(KEYS.last, { planId, title, date: today() });
    remove(KEYS.step);
  },
  lastStudy: () => read(KEYS.last, { planId: null, title: null, date: null }),

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

  /** Aide tools "Reset notes": clears hymn AND study notes. */
  resetNotes() { remove(KEYS.notes); remove(KEYS.studyNotes); },

  settings: () => read(KEYS.settings, { rate: 'slow', volume: 0.8, voiceName: null }),
  setSettings: (changes) => write(KEYS.settings, { ...store.settings(), ...changes }),
};
