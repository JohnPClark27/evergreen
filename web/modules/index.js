// index.js - the module registry: every module a study plan can use.
//
// To add a module: copy _template.js to a new file, fill it in, then add ONE import line
// and ONE entry below. Both the Studio (editor) and the tablet (player) pick it up.
// See docs/MODULES.md.
import hymn from './hymn.js';
import scripture from './scripture.js';
import prayer from './prayer.js';
import note from './note.js';
import quiz from './quiz.js';
import finishLine from './finish-line.js';

export const MODULES = [hymn, scripture, prayer, note, quiz, finishLine];

/** The module for a saved item's type, or undefined (e.g. a module removed from the app). */
export const moduleFor = (type) => MODULES.find((m) => m.type === type);
