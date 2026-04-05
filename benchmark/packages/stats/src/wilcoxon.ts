import type { HypothesisTestResult } from '@stigmergy-benchmark/core';

/**
 * Exact critical values for Wilcoxon signed-rank test (two-sided, alpha=0.05).
 * Index = n (sample size after removing zeros), value = critical W.
 * If W <= critical value, reject H0.
 * For n < 5, the test cannot reach significance at alpha=0.05.
 */
const EXACT_CRITICAL_005: Record<number, number> = {
  5: 0,
  6: 2,
  7: 3,
  8: 5,
  9: 8,
  10: 10,
  11: 13,
  12: 17,
  13: 21,
  14: 25,
  15: 30,
  16: 35,
  17: 41,
  18: 47,
  19: 53,
  20: 60,
};

/**
 * Compute exact p-value for small n using enumeration of all possible
 * rank assignments. For n <= 20 this is feasible (2^n combinations).
 */
function exactPValue(W: number, n: number): number {
  const total = 2 ** n;
  let count = 0;

  for (let mask = 0; mask < total; mask++) {
    let wPlus = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        wPlus += i + 1; // ranks are 1-indexed
      }
    }
    const wMinus = (n * (n + 1)) / 2 - wPlus;
    const wMin = Math.min(wPlus, wMinus);
    if (wMin <= W) {
      count++;
    }
  }

  return count / total;
}

/**
 * Normal approximation for large n (n > 20).
 * With continuity correction.
 */
function normalApproxPValue(W: number, n: number): number {
  const meanW = (n * (n + 1)) / 4;
  const varW = (n * (n + 1) * (2 * n + 1)) / 24;
  const z = (Math.abs(W - meanW) - 0.5) / Math.sqrt(varW);
  // Two-sided p-value from standard normal
  return 2 * (1 - normalCDF(z));
}

/** Standard normal CDF approximation (Abramowitz & Stegun). */
function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);
  return 0.5 * (1 + sign * y);
}

/** Assign average ranks for tied values. */
function rankWithTies(absValues: number[]): number[] {
  const indexed = absValues.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const ranks = new Array<number>(absValues.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j].v === indexed[i].v) {
      j++;
    }
    const avgRank = (i + 1 + j) / 2; // 1-indexed average
    for (let k = i; k < j; k++) {
      ranks[indexed[k].i] = avgRank;
    }
    i = j;
  }

  return ranks;
}

/**
 * Wilcoxon signed-rank test for paired differences.
 * Tests whether the median paired difference is significantly different from zero.
 */
export function wilcoxonSignedRank(
  pairedDifferences: number[],
): HypothesisTestResult {
  // Remove zero differences
  const nonZero = pairedDifferences.filter(d => d !== 0);
  const n = nonZero.length;

  if (n === 0) {
    return {
      testName: 'wilcoxon_signed_rank',
      statistic: 0,
      pValue: 1,
      significant: false,
      interpretation: 'All differences are zero — no difference detected',
    };
  }

  if (n < 5) {
    // Test has very low power for n < 5
    const absValues = nonZero.map(Math.abs);
    const ranks = rankWithTies(absValues);
    let wPlus = 0;
    let wMinus = 0;
    for (let i = 0; i < n; i++) {
      if (nonZero[i] > 0) wPlus += ranks[i];
      else wMinus += ranks[i];
    }
    const W = Math.min(wPlus, wMinus);
    return {
      testName: 'wilcoxon_signed_rank',
      statistic: W,
      pValue: 1, // Cannot reach significance
      significant: false,
      interpretation: `Sample too small (n=${n}) for reliable Wilcoxon test — low power warning`,
    };
  }

  // Rank absolute differences, handling ties
  const absValues = nonZero.map(Math.abs);
  const ranks = rankWithTies(absValues);

  let wPlus = 0;
  let wMinus = 0;
  for (let i = 0; i < n; i++) {
    if (nonZero[i] > 0) wPlus += ranks[i];
    else wMinus += ranks[i];
  }

  const W = Math.min(wPlus, wMinus);

  // Compute p-value
  const pValue = n <= 20 ? exactPValue(W, n) : normalApproxPValue(W, n);

  return {
    testName: 'wilcoxon_signed_rank',
    statistic: W,
    pValue,
    significant: pValue < 0.05,
    interpretation: pValue < 0.05
      ? `Median difference is statistically significant (p = ${pValue.toFixed(4)})`
      : `No statistically significant difference detected (p = ${pValue.toFixed(4)})`,
  };
}

/**
 * One-sided Wilcoxon test. Used internally by TOST.
 * direction 'less': tests if median < threshold
 * direction 'greater': tests if median > threshold
 */
export function oneSidedWilcoxon(
  differences: number[],
  threshold: number,
  direction: 'less' | 'greater',
): number {
  const shifted = differences.map(d => d - threshold);
  const nonZero = shifted.filter(d => d !== 0);
  const n = nonZero.length;

  if (n === 0) return 0.5;

  const absValues = nonZero.map(Math.abs);
  const ranks = rankWithTies(absValues);

  let wPlus = 0;
  let wMinus = 0;
  for (let i = 0; i < n; i++) {
    if (nonZero[i] > 0) wPlus += ranks[i];
    else wMinus += ranks[i];
  }

  // For 'less': use W+ (small W+ means data tends to be less than threshold)
  // For 'greater': use W- (small W- means data tends to be greater than threshold)
  const W = direction === 'less' ? wPlus : wMinus;

  if (n <= 20) {
    // One-sided exact p-value
    const total = 2 ** n;
    let count = 0;
    for (let mask = 0; mask < total; mask++) {
      let wp = 0;
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) wp += i + 1;
      }
      const testW = direction === 'less' ? wp : (n * (n + 1)) / 2 - wp;
      if (testW <= W) count++;
    }
    return count / total;
  }

  // Normal approximation (one-sided)
  const meanW = (n * (n + 1)) / 4;
  const varW = (n * (n + 1) * (2 * n + 1)) / 24;
  const z = (W - meanW) / Math.sqrt(varW);
  return normalCDF(z);
}
