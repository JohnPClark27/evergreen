// prompt.ts - the "Chosen for you" prompt and its example verses, in one place.
//
// Admins edit the guidance and examples in the Studio ("AI prompt" page, table ai_prompts,
// migration 0010). This file holds the FIXED rules and the defaults used if the table can't be
// read.
//
// The examples GUIDE the model (chain-of-thought, few-shot); it may choose another passage.
// Whatever it chooses is only a REFERENCE: the server checks it and fetches the text from
// YouVersion. The model never writes verse text, prayers or teaching.

export type MoodExample = { level: number; label: string; themes: string[]; refs: string[] };

/** Draft examples per mood (references as BOOK.chapter.start-end). Pastor to review. */
export const MOOD_EXAMPLES: MoodExample[] = [
  { level: 1, label: "Wonderful", themes: ["joy", "praise", "thanksgiving"], refs: ["PSA.100.1-2", "PHP.4.4-5", "PSA.118.24-24", "PSA.103.1-2"] },
  { level: 2, label: "Good", themes: ["gratitude", "God's care", "faithfulness"], refs: ["PSA.23.1-3", "LAM.3.22-23", "PSA.136.1-1", "PSA.121.1-2"] },
  { level: 3, label: "Okay", themes: ["steadiness", "quiet trust", "daily strength"], refs: ["PSA.121.7-8", "ISA.40.29-31", "PSA.46.10-10", "MAT.6.34-34"] },
  { level: 4, label: "Not so good", themes: ["rest", "God's nearness", "strength in weakness"], refs: ["PSA.46.1-1", "MAT.11.28-29", "ISA.41.10-10", "PSA.62.5-6"] },
  { level: 5, label: "Having a hard day", themes: ["comfort", "not being alone", "hope"], refs: ["PSA.34.18-18", "ISA.43.1-2", "JHN.14.1-1", "2CO.1.3-4", "PSA.42.11-11"] },
];

/** Editable part (the Studio's "AI prompt" page, table ai_prompts): tone and preferences.
 * This is the default if the table can't be read. */
export const DEFAULT_GUIDANCE = [
  "You help choose a short Bible passage and four activities for an older adult in a care home, using a large-print tablet.",
  "They just told us how they feel. Choose a verse of the day that is gentle, well known, and fitting for that feeling.",
  "Avoid passages about judgment, punishment, death or illness, and anything that could frighten or confuse.",
  "Prefer gentle, familiar passages (for example from the Psalms, the Gospels and God's promises).",
  "Use the examples as a guide to tone and theme only. Choose activities connected to the verse or the feeling.",
].join(" ");

/** FIXED rules, always added after the editable guidance (they can't be edited in the Studio). */
export const FIXED_RULES = [
  "Rules you must always follow:",
  "Choose freely from the WHOLE Bible: any passage that fits the feeling and its themes. The examples only show the tone and themes; they are NOT a list to pick from. Use an example only if it is clearly the best fit, and otherwise prefer a fitting passage that is not in the examples.",
  "The verse of the day is 1 to 3 consecutive verses.",
  "Give ONLY a reference (book code, chapter, verses). Never write out verse text, prayers or teaching.",
  "Choose exactly 4 activities from the lists given, by exact id. Any mix is fine, and a kind may repeat if the items differ (e.g. two different hymns).",
  "Reasons are one short plain sentence for the caregiver, with no Scripture quotes.",
  "Think step by step first, briefly (under 100 words), inside <thinking></thinking>: the feeling, a fitting theme, two or three candidate passages, the best one, then the activities. After </thinking>, reply with JSON only.",
].join(" ");

export const MOOD_LABELS: Record<number, string> = { 1: "Wonderful", 2: "Good", 3: "Okay", 4: "Not so good", 5: "Having a hard day" };

/** Few-shot examples, shown to the model as a list. */
export function examplesText(examples: MoodExample[] = MOOD_EXAMPLES): string {
  return examples.map((e) => `- Feeling "${MOOD_LABELS[e.level] ?? e.label}" (themes: ${e.themes.join(", ") || "-"}): e.g. ${e.refs.join(", ")}`).join("\n");
}
