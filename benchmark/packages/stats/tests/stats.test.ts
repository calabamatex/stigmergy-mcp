import { describe, it, expect } from 'vitest';
import {
  SeededRandom,
  bootstrapCI,
  mean,
  median,
  stdDev,
  percentile,
  cv,
  computeDescriptiveStats,
  wilcoxonSignedRank,
  tostEquivalence,
  determineReportingLevel,
  computePerTrialMetrics,
} from '../src/index.js';
import { ReportingLevel, type TrialResult, type RunResult, RunType } from '@stigmergy-benchmark/core';

// ============================================================
// PRNG Tests
// ============================================================

describe('SeededRandom', () => {
  it('produces deterministic output with same seed', () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('produces values in [0, 1)', () => {
    const rng = new SeededRandom(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds produce different sequences', () => {
    const a = new SeededRandom(1);
    const b = new SeededRandom(2);
    const aVals = Array.from({ length: 10 }, () => a.next());
    const bVals = Array.from({ length: 10 }, () => b.next());
    expect(aVals).not.toEqual(bVals);
  });
});

// ============================================================
// Descriptive Stats Tests
// ============================================================

describe('Descriptive statistics', () => {
  it('computes mean correctly', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
    expect(mean([10])).toBe(10);
    expect(mean([])).toBe(0);
  });

  it('computes median correctly', () => {
    expect(median([1, 2, 3, 4, 5])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([7])).toBe(7);
  });

  it('computes sample std dev', () => {
    // Known: stddev of [2, 4, 4, 4, 5, 5, 7, 9] = 2.138...
    const s = stdDev([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(s).toBeCloseTo(2.1381, 3);
  });

  it('computes percentiles', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(data, 25)).toBeCloseTo(3.25, 2);
    expect(percentile(data, 50)).toBeCloseTo(5.5, 2);
    expect(percentile(data, 75)).toBeCloseTo(7.75, 2);
  });

  it('computes CV correctly', () => {
    expect(cv([5, 5, 5, 5])).toBe(0);
    const c = cv([1, 2, 3, 4, 5]);
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(1);
  });

  it('handles single-value input', () => {
    const stats = computeDescriptiveStats([42]);
    expect(stats.mean).toBe(42);
    expect(stats.median).toBe(42);
    expect(stats.stdDev).toBe(0);
    expect(stats.n).toBe(1);
    expect(stats.ci.lower).toBeNaN();
  });

  it('returns NaN CI for n < 3', () => {
    const stats = computeDescriptiveStats([1, 2]);
    expect(stats.ci.lower).toBeNaN();
    expect(stats.ci.upper).toBeNaN();
  });
});

// ============================================================
// Bootstrap CI Tests
// ============================================================

describe('Bootstrap CI', () => {
  it('returns NaN for n < 3', () => {
    const ci = bootstrapCI([1, 2], { resamples: 1000, ciLevel: 0.95, seed: 42 });
    expect(ci.lower).toBeNaN();
    expect(ci.upper).toBeNaN();
  });

  it('is reproducible with same seed', () => {
    const data = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const a = bootstrapCI(data, { resamples: 5000, ciLevel: 0.95, seed: 42 });
    const b = bootstrapCI(data, { resamples: 5000, ciLevel: 0.95, seed: 42 });
    expect(a.lower).toBe(b.lower);
    expect(a.upper).toBe(b.upper);
  });

  it('CI narrows as n increases', () => {
    const seed = 99;
    const small = Array.from({ length: 5 }, (_, i) => 50 + i * 2);
    const medium = Array.from({ length: 10 }, (_, i) => 50 + i);
    const large = Array.from({ length: 20 }, (_, i) => 50 + i * 0.5);

    const ciSmall = bootstrapCI(small, { resamples: 5000, ciLevel: 0.95, seed });
    const ciMedium = bootstrapCI(medium, { resamples: 5000, ciLevel: 0.95, seed });
    const ciLarge = bootstrapCI(large, { resamples: 5000, ciLevel: 0.95, seed });

    const widthSmall = ciSmall.upper - ciSmall.lower;
    const widthMedium = ciMedium.upper - ciMedium.lower;
    const widthLarge = ciLarge.upper - ciLarge.lower;

    expect(widthMedium).toBeLessThanOrEqual(widthSmall);
    expect(widthLarge).toBeLessThanOrEqual(widthMedium);
  });

  it('symmetric data produces roughly symmetric CI', () => {
    const data = [45, 47, 49, 50, 51, 53, 55];
    const ci = bootstrapCI(data, { resamples: 10000, ciLevel: 0.95, seed: 42 });
    const med = median(data);
    const distLower = med - ci.lower;
    const distUpper = ci.upper - med;
    // Should be roughly equal (within 50% of each other)
    expect(Math.abs(distLower - distUpper)).toBeLessThan(Math.max(distLower, distUpper) * 0.5);
  });
});

// ============================================================
// Wilcoxon Signed-Rank Tests
// ============================================================

describe('Wilcoxon signed-rank', () => {
  it('all zeros returns non-significant', () => {
    const result = wilcoxonSignedRank([0, 0, 0, 0, 0]);
    expect(result.significant).toBe(false);
    expect(result.pValue).toBe(1);
  });

  it('n < 5 returns low-power warning', () => {
    const result = wilcoxonSignedRank([1, 2, 3]);
    expect(result.significant).toBe(false);
    expect(result.interpretation).toContain('low power');
  });

  it('detects significant difference with clear signal', () => {
    // All positive differences — strong signal
    const diffs = [10, 12, 15, 8, 11, 14, 9, 13, 16, 10];
    const result = wilcoxonSignedRank(diffs);
    expect(result.significant).toBe(true);
    expect(result.pValue).toBeLessThan(0.05);
  });

  it('detects non-significant with mixed differences', () => {
    // Roughly balanced around zero
    const diffs = [2, -3, 1, -2, 3, -1, 2, -3, 1, -2];
    const result = wilcoxonSignedRank(diffs);
    expect(result.significant).toBe(false);
  });

  it('handles ties correctly', () => {
    // Ties in absolute values should get average ranks
    const diffs = [5, 5, -5, 10, 10, 10];
    const result = wilcoxonSignedRank(diffs);
    expect(result.testName).toBe('wilcoxon_signed_rank');
    expect(typeof result.pValue).toBe('number');
    expect(result.pValue).toBeGreaterThan(0);
  });
});

// ============================================================
// TOST Tests
// ============================================================

describe('TOST equivalence', () => {
  it('confirms equivalence for data centered at 0 with low variance', () => {
    // 20 values tightly centered around 0
    const diffs = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 0.5 : -0.5));
    const result = tostEquivalence(diffs, 5);
    expect(result.significant).toBe(true);
    expect(result.interpretation).toContain('equivalent');
  });

  it('rejects equivalence for data centered at 15%', () => {
    const diffs = Array.from({ length: 20 }, () => 15);
    const result = tostEquivalence(diffs, 5);
    expect(result.significant).toBe(false);
    expect(result.interpretation).toContain('Cannot confirm');
  });

  it('warns about inadequate power for n < 15', () => {
    const diffs = [0.1, -0.2, 0.3, -0.1, 0.2, -0.3, 0.1, -0.2, 0.3, -0.1];
    const result = tostEquivalence(diffs, 5);
    expect(result.interpretation).toContain('inadequate power');
  });
});

// ============================================================
// Reporting Level Tests
// ============================================================

describe('Reporting levels', () => {
  it('returns correct level for each threshold', () => {
    expect(determineReportingLevel(2)).toBe(ReportingLevel.RAW_ONLY);
    expect(determineReportingLevel(4)).toBe(ReportingLevel.PROVISIONAL);
    expect(determineReportingLevel(7)).toBe(ReportingLevel.PRELIMINARY);
    expect(determineReportingLevel(12)).toBe(ReportingLevel.FULL);
    expect(determineReportingLevel(25)).toBe(ReportingLevel.PUBLICATION);
  });
});

// ============================================================
// Per-Trial Metrics Tests
// ============================================================

describe('Per-trial metrics', () => {
  function makeRunResult(overrides: Partial<RunResult>): RunResult {
    return {
      runType: RunType.SINGLE_AGENT,
      runId: 'test',
      contentTransferTokens: 0,
      mechanismOverheadTokens: 0,
      coordinationInstructionsTokens: 0,
      taskReasoningTokens: 0,
      systemIdentityTokens: 0,
      interAgentTokens: 0,
      agentAutonomousTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      effectiveTokens: 0,
      cacheHitRate: 0,
      wallClockMs: 0,
      agentCount: 1,
      apiCallCount: 1,
      success: true,
      output: null,
      tokenLog: [],
      ...overrides,
    };
  }

  it('computes savings correctly', () => {
    const trial: TrialResult = {
      trialIndex: 0,
      comparisonId: 'test',
      singleAgent: makeRunResult({
        runType: RunType.SINGLE_AGENT,
        totalTokens: 4000,
        agentAutonomousTokens: 4000,
      }),
      messagePassing: makeRunResult({
        runType: RunType.MESSAGE_PASSING,
        interAgentTokens: 8000,
        contentTransferTokens: 7000,
        coordinationInstructionsTokens: 1000,
        agentAutonomousTokens: 5000,
        totalTokens: 13000,
        effectiveTokens: 13000,
        wallClockMs: 15000,
        apiCallCount: 3,
      }),
      stigmergy: makeRunResult({
        runType: RunType.STIGMERGY,
        interAgentTokens: 900,
        contentTransferTokens: 400,
        mechanismOverheadTokens: 400,
        coordinationInstructionsTokens: 100,
        agentAutonomousTokens: 7000,
        totalTokens: 7900,
        effectiveTokens: 7000,
        cachedTokens: 900,
        wallClockMs: 12000,
        apiCallCount: 3,
      }),
      crossValidation: {
        classifierDriftB: 0.05,
        classifierDriftC: 0.03,
        expectedInterAgentB: 9000,
        classifiedInterAgentB: 8000,
        expectedInterAgentC: 3900,
        classifiedInterAgentC: 900,
      },
    };

    const metrics = computePerTrialMetrics(trial);

    // Inter-agent savings: (1 - 900/8000) * 100 = 88.75%
    expect(metrics.interAgentSavingsPercent).toBeCloseTo(88.75, 1);

    // CT savings: (1 - 400/7000) * 100 = 94.29%
    expect(metrics.contentTransferSavingsPercent).toBeCloseTo(94.29, 1);

    // Total savings: (1 - 7900/13000) * 100 = 39.23%
    expect(metrics.totalSavingsPercent).toBeCloseTo(39.23, 1);

    // MO cost = 400
    expect(metrics.mechanismOverheadCost).toBe(400);

    // Autonomous floor = 4000
    expect(metrics.autonomousFloor).toBe(4000);

    // Wall clock delta = 12000 - 15000 = -3000
    expect(metrics.wallClockDelta).toBe(-3000);
  });
});
