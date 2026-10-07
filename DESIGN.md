---
version: alpha
name: Hymnal Reader
description: >-
  Calm, high-contrast, large-type design for a hymn, Scripture and prayer app that an aide
  shares with an older adult in memory care, on an iPad. Cream and forest green, with soft
  yellow as the only accent. Sans-serif type, extra line spacing, nothing small, no italics.
colors:
  primary: "#1B3A2A"      # forest green: all text, primary buttons, focus ring
  on-primary: "#FFF9ED"   # cream text and icons on forest green
  background: "#FFF9ED"   # cream: the page
  surface: "#FFF9ED"      # cream: cards, buttons, inputs
  on-surface: "#1B3A2A"
  accent: "#FFE57A"       # soft yellow: current word/verse, selected, needs attention
  on-accent: "#1B3A2A"
  secondary: "#4F9B60"    # green: control outlines, progress, sung words (text 24px+ only)
  tertiary: "#B9C8A2"     # sage: card edges, dividers, tags, progress track
  on-tertiary: "#1B3A2A"
typography:
  display:
    fontFamily: "Verdana, Helvetica, Calibri, sans-serif"
    fontSize: 64px
    fontWeight: 700
    lineHeight: 1.2
  headline:
    fontFamily: "Verdana, Helvetica, Calibri, sans-serif"
    fontSize: 44px
    fontWeight: 700
    lineHeight: 1.25
  title-lg:
    fontFamily: "Verdana, Helvetica, Calibri, sans-serif"
    fontSize: 38px
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Verdana, Helvetica, Calibri, sans-serif"
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.3
  title-sm:
    fontFamily: "Verdana, Helvetica, Calibri, sans-serif"
    fontSize: 26px
    fontWeight: 700
    lineHeight: 1.3
  lyric:
    fontFamily: "Verdana, Helvetica, Calibri, sans-serif"
    fontSize: 32px
    fontWeight: 400
    lineHeight: 1.6
  reading:
    fontFamily: "Verdana, Helvetica, Calibri, sans-serif"
    fontSize: 28px
    fontWeight: 400
    lineHeight: 1.65
  body:
    fontFamily: "Verdana, Helvetica, Calibri, sans-serif"
    fontSize: 22px
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Verdana, Helvetica, Calibri, sans-serif"
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.3
  caption:
    fontFamily: "Verdana, Helvetica, Calibri, sans-serif"
    fontSize: 19px
    fontWeight: 400
    lineHeight: 1.5
  studio-h1:
    fontFamily: "Verdana, Helvetica, Calibri, sans-serif"
    fontSize: 30px
    fontWeight: 700
    lineHeight: 1.3
  studio-h2:
    fontFamily: "Verdana, Helvetica, Calibri, sans-serif"
    fontSize: 23px
    fontWeight: 700
    lineHeight: 1.3
  studio-body:
    fontFamily: "Verdana, Helvetica, Calibri, sans-serif"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.6
  studio-small:
    fontFamily: "Verdana, Helvetica, Calibri, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: 10px
  md: 14px
  lg: 20px
  xl: 24px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 36px
  touch: 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    height: 64px
    padding: 0 26px
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    height: 64px
    padding: 0 26px
  button-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
  side-arrow-next:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    width: 112px
  pause:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
    size: 104px
  pause-paused:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.full}"
    size: 104px
  home-tile-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.title-lg}"
    rounded: "{rounded.xl}"
    padding: 28px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.reading}"
    rounded: "{rounded.xl}"
    padding: 28px 40px
  lyric-now:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.lyric}"
  tag:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
  progress-done:
    backgroundColor: "{colors.secondary}"
    height: 10px
  progress-now:
    backgroundColor: "{colors.primary}"
    height: 10px
  studio-nav:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.studio-body}"
  studio-nav-current:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
  chip-published:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.studio-small}"
    rounded: "{rounded.full}"
  chip-pending:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.studio-small}"
    rounded: "{rounded.full}"
  chip-approved:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    typography: "{typography.studio-small}"
    rounded: "{rounded.full}"
  banner-warn:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
  banner-ok:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    rounded: "{rounded.sm}"
---

# Hymnal Reader design system

## Overview

Hymnal Reader is used by an **aide sitting beside an older adult**, often someone living with
memory loss, on an iPad held at arm's length. The design has one job: make the hymn, the
passage and the prayer easy to see and the next step obvious. The mood is **calm, warm and
plain**. It should feel like a large-print hymnal, not like an app.

The rules come from the team's style guide (`style_guide_draft.md`, 2026-10-06):
- **Sans-serif type only:** Verdana, Helvetica, Calibri.
- **Extra line spacing.**
- **12–14 pt or larger, with a clear hierarchy.** Nothing is smaller.
- **High contrast.**
- **Cream and forest green are the main colours, soft yellow is the accent**, and only the five
  palette colours are used.
- **Never:** serif or script fonts, condensed or thin weights, italics, or any other colour.

These rules beat older design notes: `docs/PLAN_PROMPT.md` §4 (sepia, burgundy, Literata) is
superseded. The logo system isn't applied yet; it comes in a later iteration.

**Two surfaces, one system:**
- the **tablet app** (`web/`): large, sparse, touch-first, iPad landscape first
- the **Studio** (`web/studio/`): the authoring tool on a laptop. Same palette and font, at
  desktop sizes that still respect the 12 pt floor.

**Where the tokens live:** `web/css/core.css` defines them as CSS custom properties: the five
palette colours, then the roles that screens use. `web/css/app.css` (tablet) and
`web/studio/studio.css` (Studio) use **only the role variables**, never raw hex values. To change
a colour, change it in `core.css` and in this file's front matter together.

Optional check of this file's structure and contrast pairs:
`npx @google/design.md lint DESIGN.md` ([format spec](https://github.com/google-labs-code/design.md)).

## Colors

Five colours, no others. Measured WCAG contrast decides what each one may do:

| Colour | Hex | Role | CSS |
|---|---|---|---|
| Forest green | `#1B3A2A` | **All text.** Primary buttons, the focus ring, "done" ticks | `--ink`, `--primary`, `--focus` |
| Cream | `#FFF9ED` | The page, cards and buttons. Text and icons on forest green | `--bg`, `--surface`, `--on-primary` |
| Soft yellow | `#FFE57A` | **Accent:** the current word or verse, a selected choice, "look here" | `--highlight` |
| Green | `#4F9B60` | Outlines of buttons, tiles and inputs; progress; sung lyric words | `--control-border`, `--ink-soft` |
| Sage | `#B9C8A2` | Card edges, dividers, tags, the empty part of a progress bar | `--line`, `--tag` |

| Pair | Ratio | Allowed use |
|---|---|---|
| Forest on cream | 11.88:1 | any text (AAA) |
| Forest on yellow | 9.93:1 | any text (AAA) |
| Forest on sage | 7.03:1 | any text (AAA) |
| Cream on forest | 11.88:1 | any text (AAA) |
| Green on cream | 3.24:1 | outlines, icons, progress; text only at **24 px or larger** |
| Green on forest | 3.67:1 | outlines next to a forest fill |
| Yellow, sage on cream | 1.20 / 1.69:1 | fills behind forest text only, never text or a control's only edge |

- **Forest green is the only colour for normal-size text.** Secondary text (captions, meta lines)
  stays forest green and is set apart by size and weight, not by a lighter grey.
- **Green text is for large, de-emphasised text only:** sung lyric words (32 px) and the
  instrumental intro. Everything under 24 px is forest green.
- **Yellow marks "now" or "chosen":** the word being sung, the verse being read, the
  revealed quiz answer, a selected option, a paused Pause button, the ring around a button
  that's ready to press. Text on yellow is always forest green.
- **No red, blue or grey.** Errors and warnings in the Studio use yellow with forest text and a
  heavier border, and they always say what is wrong in words, so colour is never the only signal.
- **Transparency** only for the dialog backdrop (forest at 45–75%) and disabled controls (the
  standard faded look). It never makes a new colour for text.

## Typography

One family everywhere: **`Verdana, Helvetica, Calibri, sans-serif`** (CSS `--font`). Verdana
comes first because it was designed for screens: wide letters, a tall x-height, and easy to
tell apart `I`, `l` and `1`. It's installed on iPadOS, macOS and Windows, so **no web font is
downloaded**. Helvetica and Calibri are the fallbacks the style guide names.

**Tablet scale** (px; 1 pt = 1.33 px):

| Token | Size / line height | Weight | Used for |
|---|---|---|---|
| `display` | 64 / 1.2 | 700 | "Welcome." on Home |
| `headline` | 44 / 1.25 | 700 | the Finished heading |
| `title-lg` | 38 / 1.3 | 700 | hymn and passage titles in a card; Home tile titles (34 px) |
| `title` | 32 / 1.3 | 700 | screen titles |
| `title-sm` | 26 / 1.3 | 700 | plan and hymn tile titles, study rows, Aide tools sections |
| `lyric` | 32 / 1.6 | 400 | hymn words (karaoke) |
| `reading` | 28 / 1.65 | 400 | Scripture, prayers, notes, quiz (`--text-session`) |
| `body` | 22 / 1.6 | 400 | everything else |
| `label` | 22 / 1.3 | 700 | buttons |
| `caption` | 19 / 1.5 | 400 | attribution, tile meta, tags: the **smallest tablet text** (14 pt) |

**Studio scale:** `studio-h1` 30, `studio-h2` 23, h3 20, `studio-body` 18 / 1.6, and
`studio-small` 16 / 1.5 (chips, hints, table headers): the **12 pt floor**.

- **Weights: 400 and 700 only.** Verdana has no thin or condensed cuts; never fake them.
- **No italics, anywhere.** Emphasis is bold. This includes the sheet music: `web/js/sheet.js`
  sets every abcjs font (title, lyrics, tempo, measure numbers, triplets…) to the same family,
  upright, and strips `%%…font` lines from hymn files.
- **Line height at least 1.5 for running text** (1.6 to 1.65 for reading text) and about 1.3 for
  headings.
- **Hierarchy comes from size and weight**, never from colour alone.

## Layout

- **iPad landscape (1180×820) first**, portrait (820×1180) second, phones (from 390 px) must
  still work, with no sideways scrolling.
- **Spacing scale:** 4, 8, 16, 24, 36 px. Screens use 16–24 px padding and 14–24 px gaps.
- **Touch targets: at least 64 px** (`--touch`). The main controls are bigger: side arrows are
  112 px wide and as tall as the card, Pause is 104 px, and Home tiles are 260 px tall.
- **A study screen:** a top bar (Plan · "Part 2 of 6" + progress · Read aloud), then the card with
  big **Back / Next** arrows on either side, and the control bar joined under the card
  (Again · Pause · tools).
- **Reading width:** centred prayers and passages are at most 900 px wide, so lines stay short.
- **Grids:** Home has 3 tiles (1 column in portrait). Sing a Hymn is 3×3 (2 wide in portrait).
  Study plans are 3 wide (1 on phones) and scroll.

## Elevation & Depth

Flat. Cards and buttons sit on the page with **outlines, not shadows**, so nothing looks like
it's floating or out of focus for low-vision eyes.

- **Edges:** sage (2 px) for cards and dividers; green (2–3 px) for anything you can press.
- **Rings instead of shadows:** a 6 px soft-yellow ring around a control means "press this
  next"; the 4 px forest focus ring shows keyboard focus.
- **Overlays:** dialogs sit on a forest-green backdrop at 45% (the Studio preview at 75%).

## Shapes

Soft, friendly corners; nothing sharp.

| Token | Radius | Used for |
|---|---|---|
| `sm` | 10 px | Studio buttons, inputs, banners |
| `md` | 14 px | tablet selects, day buttons |
| `lg` | 20 px | grid tiles, quiz choices, study rows |
| `xl` | 24 px | cards, side arrows, dialogs; Home tiles use 28 px |
| `full` | 999 px | pills, tags, chips, round buttons |

Round controls (Pause, thumbs, the narrow-screen tool buttons) are full circles.

## Components

**Buttons**
- **Primary** (`.pill.primary`, `.tile.primary`, `.side-arrow.primary`, `.btn.primary`): forest
  fill, cream text. One per screen, for the obvious next step.
- **Default** (`.pill`, `.tile`, `.ctl`, `.btn`): cream fill, green outline, forest text.
- **Selected / on** (`.pill.selected`, `.day-btn.selected`, `.voice-toggle.on`, pressed
  thumbs): yellow fill, forest outline, forest text.
- **Disabled:** faded (opacity 0.4) with no pointer.
- **Pause** (`.round`): a 104 px forest circle with a cream icon. When paused it turns
  **yellow with a forest icon and outline**, so "tap to resume" stands out.

**Reading**
- **Card** (`.card`, `.module-panel`): cream with a 2 px sage edge, 24 px corners. It holds
  `reading` or `lyric` type.
- **Current word** (`.lyric-word.now`) and **current verse** (`.reading`): yellow fill behind
  forest text. Words already sung (`.lyric-word.sung`) turn green.
- **Badge / tag** (`.badge`, `.tag`): sage pill with forest text. `.tag.quiet` is cream with a
  green outline.
- **Progress** (`.progress`, `.mini-progress`): a sage track, green for done and forest for now.

**Studio**
- **Top nav:** a forest bar with cream links; the current page is a yellow pill.
- **Status chips:** Draft (cream, green outline) · Waiting for review (yellow) ·
  Approved (sage) · Live (forest, cream text) · Archived (cream, dashed outline).
- **Banners:** neutral (cream, sage edge) · OK (sage) · Warning (yellow) · Error (yellow with a
  heavy forest edge on the left). The message always says what happened.
- **Destructive buttons** (`.btn.danger`): cream with a heavy forest outline. A confirm dialog
  guards them.

## Do's and Don'ts

**Do**
- Use `Verdana, Helvetica, Calibri, sans-serif` (the `--font` variable) for everything.
- Keep running text at line height 1.5 or more.
- Keep the tablet at 19 px or larger and the Studio at 16 px or larger, with a clear size step
  between levels.
- Use forest green for text, cream for surfaces, and yellow only to point at "now" or "chosen".
- Give every control a green or forest outline (3:1 or better), and keep the forest focus ring.
- Use the role variables (`--ink`, `--surface`, `--highlight`, `--control-border`…), never
  raw hex values.
- Re-run `tests/browser/a11y.mjs` (axe, WCAG 2.2 AA) after any style change.

**Don't**
- Use serif or script fonts (Times New Roman, Garamond, Georgia, Literata, handwriting).
- Use thin, light or condensed weights, or weights other than 400 and 700.
- Use italics, even for book titles, credits or "for the aide" notes.
- Go below 12 pt (16 px) anywhere.
- Use any colour outside the five, including white, black, grey, red or blue. Use opacity
  only as described in Colors.
- Put green text under 24 px, or yellow or sage text anywhere.
- Signal anything by colour alone: pair it with a word, an icon or a change in outline.
- Add the logos yet: that's a later iteration.
