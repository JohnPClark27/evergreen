// mood.js - "How are you feeling today?": the five answers, their faces, and (for now) the
// example passages each answer may lead to.
//
// The answer stays on this tablet for this visit only (sessionStorage), never saved.
// Passages are REFERENCES only (the text is fetched live from YouVersion). The lists below
// are a DRAFT for a pastor to review; they will also be the examples in the AI's prompt.

export const MOODS = [
  { level: 1, label: 'Wonderful', mouth: 'M18 37 Q32 54 46 37' },
  { level: 2, label: 'Good', mouth: 'M20 40 Q32 49 44 40' },
  { level: 3, label: 'Okay', mouth: 'M21 43 L43 43' },
  { level: 4, label: 'Not so good', mouth: 'M20 47 Q32 40 44 47' },
  { level: 5, label: 'Having a hard day', mouth: 'M18 49 Q32 36 46 49' },
];

/** Draft example passages per mood (book, chapter, first and last verse). Pastor to review. */
export const MOOD_EXAMPLES = {
  1: [['PSA', 100, 1, 5], ['PHP', 4, 4, 7], ['PSA', 103, 1, 5], ['PSA', 150, 1, 6]],
  2: [['PSA', 23, 1, 6], ['LAM', 3, 22, 24], ['PSA', 136, 1, 4], ['PSA', 121, 1, 8]],
  3: [['PSA', 121, 1, 8], ['ISA', 40, 28, 31], ['MAT', 6, 25, 27], ['PSA', 46, 1, 3]],
  4: [['PSA', 46, 1, 3], ['MAT', 11, 28, 30], ['ISA', 41, 10, 13], ['PSA', 62, 5, 8]],
  5: [['PSA', 34, 17, 18], ['ISA', 43, 1, 2], ['JHN', 14, 1, 3], ['2CO', 1, 3, 4], ['PSA', 42, 11, 11]],
};

export const moodFor = (level) => MOODS.find((m) => m.level === Number(level)) ?? null;

/** A face (fixed SVG markup, decorative): yellow, forest outline; the mouth shows the mood. */
export function faceSvg(mood) {
  return `<svg viewBox="0 0 64 64" aria-hidden="true" class="face">
    <circle cx="32" cy="32" r="28" fill="var(--highlight)" stroke="var(--ink)" stroke-width="3"/>
    <circle cx="23" cy="26" r="3.6" fill="var(--ink)"/><circle cx="41" cy="26" r="3.6" fill="var(--ink)"/>
    <path d="${mood.mouth}" fill="none" stroke="var(--ink)" stroke-width="3.6" stroke-linecap="round"/></svg>`;
}

/** "Good morning" / "Good afternoon" / "Good evening" for the tablet's local time. */
export function greeting(date = new Date()) {
  const hr = date.getHours();
  return hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
}

const KEY = 'hr.mood';
export function saveMood(level) { try { sessionStorage.setItem(KEY, String(level)); } catch { /* fine */ } }
export function savedMood() { try { return moodFor(sessionStorage.getItem(KEY)); } catch { return null; } }
