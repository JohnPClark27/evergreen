# Modules: how study plans are built, and how to add a new kind

A **study plan** is an ordered list of **modules**. Authors pick any mix and order in the Studio,
e.g. two hymns, a passage, their own note, a quiz, then a closing hymn. The tablet plays them one
after another.

Each module is **one file** in `web/modules/`. The same file serves both apps:
- the **Studio** uses its `editor()`, `validate()` and `summary()`
- the **tablet** uses its `play()`

## The modules today

| Type | Name | What the resident sees | Saved config |
|---|---|---|---|
| `hymn` | Hymn | the hymn sung, with the words lit up (sheet music optional) | `{ hymn_id, sheet }` |
| `scripture` | Scripture | a short passage (≤ 12 verses) in large print, read aloud, with YouVersion attribution | `{ book, chapter, start, end }` (a **reference only**) |
| `prayer` | Prayer | a library prayer, read line by line, with its source | `{ prayer_id }` (library only) |
| `note` | Note | the author's own words in large print, read aloud if chosen | `{ title, text, read_aloud }` |
| `quiz` | Quiz | one question at a time with big answers. The answer is **revealed gently**; nothing is scored | `{ title, read_aloud, questions: [{ q, choices[4], answer }] }` |
| `word-search` | Word Search | a 6×6 (easy: across/down) or 8×8 (normal: + diagonal) grid of words from a passage; tap first then last letter; word bank always shown | `{ book, chapter, start, end, difficulty }` (a **reference only**) |
| `crossword` | Crossword | 4–6 words from a passage; each clue is the verse with that word left out; "Show a letter" / "Show the word" | same |
| `trivia` | Bible Trivia | 3 questions about what the passage says (AI-written from the fetched text, every answer checked word for word; else fill-in-the-blank built on the tablet); the verse is shown after each answer | same |
| `finish-line` | Finish the Line | a hymn line with the last words hidden. "Play the line" plays just that line; "Show the words" reveals them | `{ hymn_id, stanza, lines }` |

The three games share `game-common.js` (editor, passage loading, word picking, a seeded
random generator so the same passage gives the same puzzle, and the trivia answer check).
The database refuses anything but a reference + difficulty in their config (migration 0009).

## Add a module in 3 steps

```sh
cp web/modules/_template.js web/modules/memory-verse.js     # 1. copy the template
#                                                             2. fill it in (below)
```

```js
// 3. web/modules/index.js: one import, one entry
import memoryVerse from './memory-verse.js';
export const MODULES = [hymn, scripture, prayer, note, quiz, finishLine, memoryVerse];
```

That's all. The Studio's "Add a module" palette, its validation, the plan outline, the preview
and the tablet player all pick it up from the registry. **No database change is needed**: modules
are stored as `module_type` + a JSON `config`.

## The contract

```js
export default {
  type: 'memory-verse',     // saved for every item: lowercase, a-z 0-9 - _ ; never rename once used
  name: 'Memory Verse',     // the palette label
  icon: '❖',                // one short symbol
  description: '…',         // one sentence for the palette
  musicBed: true,           // true: a hymn sung just before keeps playing softly under this module

  defaults: () => ({ … }),                 // config for a newly added module
  validate: (config, lib) => [ '…' ],      // friendly problems that block submitting ([] = fine)
  summary: (config, lib) => '…',           // one line in the plan outline

  editor(config, { set, get, lib }) {      // Studio form → an element
    // set(patch)                    merge into the config (e.g. set({ text: v }))
    // set(patch, { redraw: true })  …and redraw this form (after adding/removing parts)
    // get()                         the LATEST config: use it in handlers, not `config`
    // lib.hymns / lib.hymn(id) / lib.prayers / lib.prayer(id)   published library only
  },

  play(stage, config, kit) {               // tablet: draw into `stage` (the big card)
    // kit.audio, kit.speaker, kit.api (getHymnById, getPassage, getTiming, …), kit.paused()
    return {                               // a controller for the bar under the card
      againLabel: 'Read again', again() {}, pause() {}, resume() {},
      tools: [button],                     // optional: extra buttons for that bar (e.g. sheet music)
      stop() {},                           // REQUIRED: stop sound/timers when the aide moves on
      musicUrl,                            // optional: a hymn later modules can keep under them
    };
  },
};
```

**Helpers in `web/modules/kit.js`:**
- **Form fields:** `field`, `textInput`, `textArea`, `numberInput`, `select`, `searchSelect`.
- **`readAloud(stage, kit, { title, lines, footer, badge, centered, speak })`:** large text read
  aloud with the current line highlighted. It returns a ready-made controller.

**The runner** (`web/js/runner.js`) provides the frame and buttons: Home/Close, "Part 2 of 6",
the progress bar, big Back and Next/Finish arrows beside the card, and a bar joined to the
bottom of the card with Again · Pause · the module's `tools`.
A module only draws its own content.

## Rules every module must follow

- **Content integrity:**
  - Never put Scripture text or prayer text in `config`. Use the `scripture` / `prayer` modules,
    which store a reference or library id.
  - The database **enforces** this for those two types (`module_config_ok`), and refuses verse
    text in a scripture module or typed-in text in a prayer module.
- **Gentle:** no scores, streaks, timers, or "wrong!". Reveal answers kindly. Nothing a resident
  does is recorded.
- **Big and simple:** session text ≥ 28 px, buttons ≥ 64 px. Use the classes in `web/css/app.css`
  (`.big-text`, `.pill`, `.read-line`, `.quiz-choice`).
- **Sound:** only the shared `kit.audio` / `kit.speaker`. Device voices only, no cloud TTS.
  Don't start sound when `kit.paused()` is true. Stop everything in `stop()`.
- **Hymns:** a module that names a hymn should store `hymn_id`. The review check then blocks
  publishing a plan whose hymn isn't published.
- **Accessibility:** real `<button>`s, visible labels, and nothing that only works by dragging.
- **Test it:** add it to `tests/browser/fixture_all_modules.py` and walk it in
  `tests/browser/studies.mjs`. Re-run `a11y.mjs`.

## Ideas for future modules

These are suggestions only, with no content written:
- **Picture:** a public-domain image with a caption.
- **Listen:** a hymn played without words, for quiet time.
- **Match the pairs:** e.g. hymn titles ↔ first lines, from the library.
- **Responsive reading:** aide and resident take alternate lines of a library prayer.
- **Moment of quiet:** soft music for N minutes.
