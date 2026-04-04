import {
  type AggregatedStats,
  type BenchmarkTask,
  type PerTrialMetrics,
  type TrialResult,
  ReportingLevel,
  RunType,
} from '@stigmergy-benchmark/core';
import { computeDescriptiveStats } from './descriptive.js';
import { wilcoxonSignedRank } from './wilcoxon.js';
import { tostEquivalence } from './tost.js';
import { computeCategoryVarianceProfile } from './calibration.js';

export function determineReportingLevel(n: number): ReportingLevel {
  if (n < 3) return ReportingLevel.RAW_ONLY;
  if (n < 5) return ReportingLevel.PROVISIONAL;
  if (n < 10) return ReportingLevel.PRELIMINARY;
  if (n < 20) return ReportingLevel.FULL;
  return ReportingLevel.PUBLICATION;
}

/**
 * Aggregate per-trial metrics into full statistical summary.
 * Reporting depth adapts to the number of completed trials.
 */
export function aggregateStats(
  trials: TrialResult[],
  perTrialMetrics: PerTrialMetrics[],
  task: BenchmarkTask,
): AggregatedStats {
  const n = trials.length;
  const level = determineReportingLevel(n);

  const interAgentSavings = computeDescriptiveStats(
    perTrialMetrics.map(m => m.interAgentSavingsPercent),
  );
  const contentTransferSavings = computeDescriptiveStats(
    perTrialMetrics.map(m => m.contentTransferSavingsPercent),
  );
  const totalSavings = computeDescriptiveStats(
    perTrialMetrics.map(m => m.totalSavingsPercent),
  );
  const effectiveSavings = computeDescriptiveStats(
    perTrialMetrics.map(m => m.effectiveSavingsPercent),
  );

  // Hypothesis tests only for sufficient n
  const canTest = level === ReportingLevel.FULL || level === ReportingLevel.PUBLICATION;
  const canTOST = task.crossoverTask && level === ReportingLevel.PUBLICATION;

  return {
    trialCount: n,
    reportingLevel: level,

    interAgentSavings,
    contentTransferSavings,
    totalSavings,
    effectiveSavings,

    mechanismOverheadCost: computeDescriptiveStats(
      perTrialMetrics.map(m => m.mechanismOverheadCost),
    ),
    coordinationInstructionsDelta: computeDescriptiveStats(
      perTrialMetrics.map(m => m.coordinationInstructionsDelta),
    ),

    autonomousFloor: computeDescriptiveStats(
      perTrialMetrics.map(m => m.autonomousFloor),
    ),
    decompositionOverheadB: computeDescriptiveStats(
      perTrialMetrics.map(m => m.decompositionOverheadB),
    ),
    decompositionOverheadC: computeDescriptiveStats(
      perTrialMetrics.map(m => m.decompositionOverheadC),
    ),

    varianceProfileA: computeCategoryVarianceProfile(trials, RunType.SINGLE_AGENT),
    varianceProfileB: computeCategoryVarianceProfile(trials, RunType.MESSAGE_PASSING),
    varianceProfileC: computeCategoryVarianceProfile(trials, RunType.STIGMERGY),

    interAgentTest: canTest
      ? wilcoxonSignedRank(perTrialMetrics.map(m => m.interAgentSavingsPercent))
      : null,
    totalSavingsTest: canTest
      ? wilcoxonSignedRank(perTrialMetrics.map(m => m.totalSavingsPercent))
      : null,
    equivalenceTest: canTOST
      ? tostEquivalence(
          perTrialMetrics.map(m => m.interAgentSavingsPercent),
          task.equivalenceMargin,
        )
      : null,

    wallClockSavings: computeDescriptiveStats(
      perTrialMetrics.map(m => m.wallClockDelta),
    ),
    apiCallDelta: computeDescriptiveStats(
      perTrialMetrics.map(m => m.apiCallDelta),
    ),
    cacheHitRateC: computeDescriptiveStats(
      trials.map(t => t.stigmergy.cacheHitRate),
    ),
  };
}
