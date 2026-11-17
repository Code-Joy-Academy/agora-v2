export const MASTERY_COMPLETE = 0.8;

/** Equal-weight mean of per-node mastery over ALL required nodes; unassessed nodes must be passed as 0. */
export function aggregateCourseMastery(nodeMastery: number[]): { score: number; completed: boolean } {
    const values = nodeMastery.map((p) => Math.min(1, Math.max(0, Number.isFinite(p) ? p : 0)));
    const score = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    return { score, completed: values.length > 0 && values.every((p) => p >= MASTERY_COMPLETE) };
}

/** AGS scoreGiven on a 0–100 scale. */
export const toAgsScore = (score: number) => Math.round(Math.min(1, Math.max(0, score)) * 100);
