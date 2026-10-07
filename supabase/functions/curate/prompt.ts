// prompt.ts - the "Chosen for you" prompt and its example verses, in one place.
//
// NEXT PHASE: a Studio page will let admins edit this prompt and the examples; they will
// move to a database table and this file becomes the default. Keep them as plain data.
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

export const TODAY_SYSTEM = [
  "You help choose a short Bible passage and four activities for an older adult in a care home, using a large-print tablet.",
  "They just told us how they feel. Choose a 'verse of the day' that is gentle, well known, and fitting for that feeling: 1 to 3 consecutive verses.",
  "Avoid passages about judgment, punishment, death or illness, and anything that could frighten or confuse. Prefer Psalms, the Gospels and familiar promises.",
  "Use the examples as a guide to tone and theme. You may choose one of them or another passage like them.",
  "Give ONLY a reference (book code, chapter, verses). Never write out verse text, prayers or teaching.",
  "Then choose 4 activities from the lists given (by exact id), all connected to the verse or the feeling. Any mix is fine, and a kind may repeat if the items differ (e.g. two different hymns).",
  "Think step by step first, inside <thinking></thinking>: the feeling, a fitting theme, candidate passages, the best one, then the activities. After </thinking>, reply with JSON only.",
].join(" ");

/** Few-shot examples, shown to the model as a list. */
export function examplesText(): string {
  return MOOD_EXAMPLES.map((e) => `- Feeling "${e.label}" (themes: ${e.themes.join(", ")}): e.g. ${e.refs.join(", ")}`).join("\n");
}
