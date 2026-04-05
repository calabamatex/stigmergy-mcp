import type { PerTrialMetrics, TrialResult } from '@stigmergy-benchmark/core';

/**
 * Compute per-trial paired metrics from a trial's three run results.
 * Does NOT compute CIs or hypothesis tests — those are in the aggregator.
 */
export function computePerTrialMetrics(trial: TrialResult): PerTrialMetrics {
  const a = trial.singleAgent;
  const b = trial.messagePassing;
  const c = trial.stigmergy;

  const safePct = (baseline: number, experimental: number): number =>
    baseline > 0 ? (1 - experimental / baseline) * 100 : 0;

  return {
    interAgentSavingsPercent: safePct(b.interAgentTokens, c.interAgentTokens),
    contentTransferSavingsPercent: safePct(b.contentTransferTokens, c.contentTransferTokens),
    totalSavingsPercent: safePct(b.totalTokens, c.totalTokens),
    effectiveSavingsPercent: safePct(b.effectiveTokens, c.effectiveTokens),
    mechanismOverheadCost: c.mechanismOverheadTokens,
    coordinationInstructionsDelta: c.coordinationInstructionsTokens - b.coordinationInstructionsTokens,
    decompositionOverheadB: b.agentAutonomousTokens - a.totalTokens,
    decompositionOverheadC: c.agentAutonomousTokens - a.totalTokens,
    autonomousFloor: a.totalTokens,
    wallClockDelta: c.wallClockMs - b.wallClockMs,
    apiCallDelta: c.apiCallCount - b.apiCallCount,
  };
}
