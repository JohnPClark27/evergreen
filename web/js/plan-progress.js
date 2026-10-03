// plan-progress.js - small helpers about where a tablet is in a study plan.
// Progress itself lives in localStorage (store.js); nothing is sent anywhere.

/** Has this tablet finished the study? (`progress` from store.planProgress) */
export const isDone = (progress, study) => progress.done.includes(study.key);

/** The study to suggest next: the first unfinished one in order, else null (all done). */
export function nextStudy(plan, progress) {
  return plan.studies.find((s) => s.items.length && !isDone(progress, s)) ?? null;
}

/** "3 of 12 done" counts only studies that still exist in the plan. */
export function doneCount(plan, progress) {
  return plan.studies.filter((s) => isDone(progress, s)).length;
}
