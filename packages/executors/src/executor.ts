import type {
  BenchmarkTask,
  RunResult,
  RunType,
  RunContext,
  TokenUsageRecord,
  TokenCategory,
} from '@stigmergy-benchmark/core';
import type { LLMClient } from '@stigmergy-benchmark/llm-client';

export interface RunConfig {
  model: string;
  maxTurns: number;
  maxTokens: number;
  temperature: number;
  agentCount: number;
}

/**
 * Common interface for all three run executors (A, B, C).
 */
export interface RunExecutor {
  execute(
    task: BenchmarkTask,
    config: RunConfig,
    context: RunContext,
    client: LLMClient,
  ): Promise<RunResult>;
}

/**
 * Build a RunResult from accumulated token records.
 */
export function buildRunResult(
  runType: RunType,
  runId: string,
  tokenLog: TokenUsageRecord[],
  wallClockMs: number,
  agentCount: number,
  success: boolean,
  output: unknown,
): RunResult {
  let ct = 0, mo = 0, ci = 0, tr = 0, si = 0, cached = 0;

  for (const rec of tokenLog) {
    const total = rec.totalTokens;
    switch (rec.category as TokenCategory) {
      case 'CONTENT_TRANSFER': ct += total; break;
      case 'MECHANISM_OVERHEAD': mo += total; break;
      case 'COORDINATION_INSTRUCTIONS': ci += total; break;
      case 'TASK_REASONING': tr += total; break;
      case 'SYSTEM_IDENTITY': si += total; break;
    }
    cached += rec.cachedInputTokens;
  }

  const interAgent = ct + mo + ci;
  const autonomous = tr + si;
  const totalTokens = interAgent + autonomous;
  const effective = totalTokens - cached;

  return {
    runType,
    runId,
    contentTransferTokens: ct,
    mechanismOverheadTokens: mo,
    coordinationInstructionsTokens: ci,
    taskReasoningTokens: tr,
    systemIdentityTokens: si,
    interAgentTokens: interAgent,
    agentAutonomousTokens: autonomous,
    totalTokens,
    cachedTokens: cached,
    effectiveTokens: effective,
    cacheHitRate: totalTokens > 0 ? cached / totalTokens : 0,
    wallClockMs,
    agentCount,
    apiCallCount: new Set(tokenLog.map(r => r.requestId)).size,
    success,
    output,
    tokenLog,
  };
}
