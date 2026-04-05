import { describe, it, expect, beforeEach } from 'vitest';
import { BenchmarkStore } from '../src/store.js';
import { TokenCategory, RunType, type TokenUsageRecord, type TrialResult, type RunResult } from '@stigmergy-benchmark/core';

function makeRunResult(overrides: Partial<RunResult> = {}): RunResult {
  return {
    runType: RunType.SINGLE_AGENT,
    runId: 'run-1',
    contentTransferTokens: 0,
    mechanismOverheadTokens: 0,
    coordinationInstructionsTokens: 0,
    taskReasoningTokens: 100,
    systemIdentityTokens: 50,
    interAgentTokens: 0,
    agentAutonomousTokens: 150,
    totalTokens: 150,
    cachedTokens: 0,
    effectiveTokens: 150,
    cacheHitRate: 0,
    wallClockMs: 1000,
    agentCount: 1,
    apiCallCount: 1,
    success: true,
    output: null,
    tokenLog: [],
    ...overrides,
  };
}

describe('BenchmarkStore', () => {
  let store: BenchmarkStore;

  beforeEach(() => {
    store = new BenchmarkStore(':memory:');
  });

  describe('Token usage', () => {
    it('saves and retrieves token records', () => {
      const record: TokenUsageRecord = {
        id: 'tok-1',
        runId: 'run-1',
        trialIndex: 0,
        agentId: 'agent-1',
        requestId: 'req-1',
        category: TokenCategory.TASK_REASONING,
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cachedInputTokens: 0,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        timestamp: Date.now(),
        runType: RunType.SINGLE_AGENT,
        cacheHit: false,
      };

      store.saveTokenUsage(record);
      const retrieved = store.getTokenUsage('run-1');
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].id).toBe('tok-1');
      expect(retrieved[0].category).toBe(TokenCategory.TASK_REASONING);
      expect(retrieved[0].totalTokens).toBe(150);
      expect(retrieved[0].cacheHit).toBe(false);
    });

    it('filters by trial index', () => {
      for (let trial = 0; trial < 3; trial++) {
        store.saveTokenUsage({
          id: `tok-${trial}`,
          runId: 'run-1',
          trialIndex: trial,
          agentId: 'agent-1',
          requestId: `req-${trial}`,
          category: TokenCategory.TASK_REASONING,
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          cachedInputTokens: 0,
          provider: 'anthropic',
          model: 'test',
          timestamp: Date.now(),
          runType: RunType.SINGLE_AGENT,
          cacheHit: false,
        });
      }

      const all = store.getTokenUsage('run-1');
      expect(all).toHaveLength(3);

      const trial1 = store.getTokenUsage('run-1', 1);
      expect(trial1).toHaveLength(1);
      expect(trial1[0].trialIndex).toBe(1);
    });
  });

  describe('Trial results', () => {
    it('saves and retrieves trial results', () => {
      const trial: TrialResult = {
        trialIndex: 0,
        comparisonId: 'comp-1',
        singleAgent: makeRunResult({ runType: RunType.SINGLE_AGENT }),
        messagePassing: makeRunResult({ runType: RunType.MESSAGE_PASSING, runId: 'run-b' }),
        stigmergy: makeRunResult({ runType: RunType.STIGMERGY, runId: 'run-c' }),
        crossValidation: {
          classifierDriftB: 0.05,
          classifierDriftC: 0.03,
          expectedInterAgentB: 100,
          classifiedInterAgentB: 95,
          expectedInterAgentC: 50,
          classifiedInterAgentC: 48,
        },
      };

      store.saveTrialResult(trial);
      const results = store.getTrialResults('comp-1');
      expect(results).toHaveLength(1);
      expect(results[0].trialIndex).toBe(0);
      expect(results[0].singleAgent.runType).toBe(RunType.SINGLE_AGENT);
      expect(results[0].crossValidation.classifierDriftB).toBe(0.05);
    });

    it('returns multiple trials in order', () => {
      for (let i = 0; i < 3; i++) {
        store.saveTrialResult({
          trialIndex: i,
          comparisonId: 'comp-1',
          singleAgent: makeRunResult(),
          messagePassing: makeRunResult({ runType: RunType.MESSAGE_PASSING }),
          stigmergy: makeRunResult({ runType: RunType.STIGMERGY }),
          crossValidation: {
            classifierDriftB: 0,
            classifierDriftC: 0,
            expectedInterAgentB: 0,
            classifiedInterAgentB: 0,
            expectedInterAgentC: 0,
            classifiedInterAgentC: 0,
          },
        });
      }

      const results = store.getTrialResults('comp-1');
      expect(results).toHaveLength(3);
      expect(results.map(r => r.trialIndex)).toEqual([0, 1, 2]);
    });
  });

  describe('Comparison results', () => {
    it('saves and retrieves a comparison', () => {
      store.saveComparisonResult({
        id: 'comp-1',
        taskId: 'task-1',
        taskName: 'Test Task',
        timestamp: Date.now(),
        config: {
          trialCount: 10,
          provider: 'anthropic',
          model: 'test',
          temperature: 0,
          promptCachingEnabled: true,
        },
        trials: [],
        stats: {} as any,
        crossValidationCalibration: {
          runAVarianceCV: 0.07,
          calibratedThreshold: 0.14,
          perTrialDriftsB: [],
          perTrialDriftsC: [],
          flaggedTrialsB: [],
          flaggedTrialsC: [],
          overallReliable: true,
        },
      });

      const result = store.getComparisonResult('comp-1');
      expect(result).not.toBeNull();
      expect(result!.taskName).toBe('Test Task');
      expect(result!.crossValidationCalibration.runAVarianceCV).toBe(0.07);
    });

    it('lists comparisons', () => {
      for (let i = 0; i < 3; i++) {
        store.saveComparisonResult({
          id: `comp-${i}`,
          taskId: `task-${i}`,
          taskName: `Task ${i}`,
          timestamp: Date.now() + i,
          config: {
            trialCount: 10,
            provider: 'anthropic',
            model: 'test',
            temperature: 0,
            promptCachingEnabled: true,
          },
          trials: [],
          stats: {} as any,
          crossValidationCalibration: {} as any,
        });
      }

      const list = store.listComparisons();
      expect(list).toHaveLength(3);
    });

    it('returns null for non-existent comparison', () => {
      expect(store.getComparisonResult('nope')).toBeNull();
    });
  });
});
