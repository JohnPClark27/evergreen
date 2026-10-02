// store.js - everything remembered on THIS tablet, in localStorage only.
// No accounts and no names: just plan progress, per-hymn notes, and settings.
// Every read/write is wrapped: private browsing or blocked storage must never break the app.

const KEYS = {
  progress: 'hr.progress',   // { planId, currentDay, lastCompletedDate }
  step: 'hr.sessionStep',    // { planId, day, step } so a reload resumes the session
  notes: 'hr.hymnNotes',     // { [hymnNumber]: 'enjoyed' | 'skip' }
  settings: 'hr.settings',   // { rate, volume, voiceName }
  last: 'hr.lastSession',    // { planId, day, hymnNumber } for the "finished" screen
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
  progress: () => read(KEYS.progress, { planId: null, currentDay: 1, lastCompletedDate: null }),
  setProgress: (p) => write(KEYS.progress, p),

  /** Start a given day of a plan (Aide tools "Start Day"). */
  startDay(planId, day) {
    write(KEYS.progress, { ...store.progress(), planId, currentDay: day });
    remove(KEYS.step);
  },

  /** The day was finished: the next day is ready next time (plans start over after the last day). */
  completeDay(planId, day, totalDays, hymnNumber) {
    const next = day >= totalDays ? 1 : day + 1;
    write(KEYS.progress, { planId, currentDay: next, lastCompletedDate: today() });
    write(KEYS.last, { planId, day, hymnNumber });
    remove(KEYS.step);
    return next;
  },

  sessionStep: () => read(KEYS.step, { planId: null, day: null, step: 0 }),
  setSessionStep: (s) => write(KEYS.step, s),

  lastSession: () => read(KEYS.last, { planId: null, day: null, hymnNumber: null }),

  notes: () => read(KEYS.notes, {}),
  setNote(hymnNumber, note) {
    const notes = store.notes();
    if (note) notes[hymnNumber] = note; else delete notes[hymnNumber];
    write(KEYS.notes, notes);
  },
  resetNotes: () => remove(KEYS.notes),

  settings: () => read(KEYS.settings, { rate: 'slow', volume: 0.8, voiceName: null }),
  setSettings: (changes) => write(KEYS.settings, { ...store.settings(), ...changes }),
};
