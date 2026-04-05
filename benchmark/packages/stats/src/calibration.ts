import type {
  CategoryVarianceProfile,
  CrossValidationCalibration,
  RunType,
  TrialResult,
  RunResult,
} from '@stigmergy-benchmark/core';
import { RunType as RT } from '@stigmergy-benchmark/core';
import { computeDescriptiveStats } from './descriptive.js';
import { cv } from './descriptive.js';

/**
 * Calibrate cross-validation threshold against observed Run A variance.
 * Threshold = 2 × CV of Run A totals. Trials exceeding this are flagged.
 */
export function calibrateCrossValidation(
  trials: TrialResult[],
): CrossValidationCalibration {
  const runATotals = trials.map(t => t.singleAgent.totalTokens);
  const runACV = cv(runATotals);
  const calibratedThreshold = 2 * runACV;

  const perTrialDriftsB = trials.map(t => t.crossValidation.classifierDriftB);
  const perTrialDriftsC = trials.map(t => t.crossValidation.classifierDriftC);

  const flaggedB = perTrialDriftsB
    .map((d, i) => (d > calibratedThreshold ? i : -1))
    .filter(i => i >= 0);
  const flaggedC = perTrialDriftsC
    .map((d, i) => (d > calibratedThreshold ? i : -1))
    .filter(i => i >= 0);

  const totalTrials = trials.length;
  const totalFlagged = new Set([...flaggedB, ...flaggedC]).size;
  const overallReliable = totalTrials > 0 && totalFlagged / totalTrials < 0.2;

  return {
    runAVarianceCV: runACV,
    calibratedThreshold,
    perTrialDriftsB,
    perTrialDriftsC,
    flaggedTrialsB: flaggedB,
    flaggedTrialsC: flaggedC,
    overallReliable,
  };
}

function getRunResult(trial: TrialResult, runType: RunType): RunResult {
  switch (runType) {
    case RT.SINGLE_AGENT: return trial.singleAgent;
    case RT.MESSAGE_PASSING: return trial.messagePassing;
    case RT.STIGMERGY: return trial.stigmergy;
  }
}

/**
 * Compute variance profile for a specific run type across all trials.
 * Produces DescriptiveStats for each of the 5 token categories.
 */
export function computeCategoryVarianceProfile(
  trials: TrialResult[],
  runType: RunType,
): CategoryVarianceProfile {
  return {
    contentTransfer: computeDescriptiveStats(
      trials.map(t => getRunResult(t, runType).contentTransferTokens),
    ),
    mechanismOverhead: computeDescriptiveStats(
      trials.map(t => getRunResult(t, runType).mechanismOverheadTokens),
    ),
    coordinationInstructions: computeDescriptiveStats(
      trials.map(t => getRunResult(t, runType).coordinationInstructionsTokens),
    ),
    taskReasoning: computeDescriptiveStats(
      trials.map(t => getRunResult(t, runType).taskReasoningTokens),
    ),
    systemIdentity: computeDescriptiveStats(
      trials.map(t => getRunResult(t, runType).systemIdentityTokens),
    ),
  };
}

/**
 * Log diagnostic warnings for anomalous variance patterns.
 */
export function diagnoseVarianceProfile(
  profile: CategoryVarianceProfile,
  runLabel: string,
): string[] {
  const warnings: string[] = [];

  if (profile.mechanismOverhead.cv > 0.10) {
    warnings.push(
      `[${runLabel}] Mechanism Overhead CV=${(profile.mechanismOverhead.cv * 100).toFixed(1)}% > 10% — check tool call accounting`,
    );
  }

  if (profile.systemIdentity.cv > 0.01) {
    warnings.push(
      `[${runLabel}] System Identity CV=${(profile.systemIdentity.cv * 100).toFixed(1)}% > 1% — system prompt may not be identical across trials`,
    );
  }

  return warnings;
}
