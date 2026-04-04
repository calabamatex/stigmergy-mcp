import type { HypothesisTestResult } from '@stigmergy-benchmark/core';
import { oneSidedWilcoxon } from './wilcoxon.js';

/**
 * Two One-Sided Tests (TOST) for practical equivalence.
 * Tests whether the paired differences fall within ±equivalenceMargin.
 *
 * Both one-sided tests must reject for equivalence to be concluded:
 *   H₀_upper: median difference ≥ +margin  (test: is it less?)
 *   H₀_lower: median difference ≤ -margin  (test: is it greater?)
 *
 * Uses Wilcoxon-based one-sided tests for non-parametric consistency.
 */
export function tostEquivalence(
  pairedDifferences: number[],
  equivalenceMargin: number,
): HypothesisTestResult {
  const n = pairedDifferences.filter(d => d !== 0).length;

  if (n < 15) {
    const pUpper = oneSidedWilcoxon(pairedDifferences, equivalenceMargin, 'less');
    const pLower = oneSidedWilcoxon(pairedDifferences, -equivalenceMargin, 'greater');
    const p = Math.max(pUpper, pLower);

    return {
      testName: 'tost_equivalence',
      statistic: p,
      pValue: p,
      significant: p < 0.05,
      interpretation: `Warning: n=${n} < 15, inadequate power for TOST. ` + (
        p < 0.05
          ? `Savings within ±${equivalenceMargin}% (p = ${p.toFixed(4)}) but result unreliable`
          : `Cannot confirm equivalence (p = ${p.toFixed(4)})`
      ),
    };
  }

  const pUpper = oneSidedWilcoxon(pairedDifferences, equivalenceMargin, 'less');
  const pLower = oneSidedWilcoxon(pairedDifferences, -equivalenceMargin, 'greater');
  const p = Math.max(pUpper, pLower);

  return {
    testName: 'tost_equivalence',
    statistic: p,
    pValue: p,
    significant: p < 0.05,
    interpretation: p < 0.05
      ? `Savings are practically equivalent to zero (within ±${equivalenceMargin}%, p = ${p.toFixed(4)})`
      : `Cannot confirm equivalence — savings may exceed ±${equivalenceMargin}%`,
  };
}
