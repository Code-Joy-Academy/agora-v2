export function clampHintCount(value: number): 0 | 1 | 2 | 3 {
    return Math.min(3, Math.max(0, Math.floor(value))) as 0 | 1 | 2 | 3;
  }