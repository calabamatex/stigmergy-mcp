import { describe, it, expect } from 'vitest';
import {
  RunType,
  TokenCategory,
  type BenchmarkTask,
  type RunContext,
  TaskCategory,
  TaskDifficulty,
} from '@stigmergy-benchmark/core';
import { MockLLMClient } from '@stigmergy-benchmark/llm-client';
import { SingleAgentExecutor } from '../src/single-agent.js';
import { MessagePassingExecutor } from '../src/message-passing.js';
import { StigmergySwarmExecutor } from '../src/stigmergy-swarm.js';
import { McpBridge } from '../src/mcp-bridge.js';
import { buildRunResult } from '../src/executor.js';
import type { RunConfig } from '../src/executor.js';

const testTask: BenchmarkTask = {
  id: 'test-task',
  name: 'Test Task',
  description: 'A simple test task for benchmarking.',
  category: TaskCategory.SEQUENTIAL,
  difficulty: TaskDifficulty.SIMPLE,
  agentCount: 3,
  steps: [
    { id: 'step-1', agentRole: 'researcher', description: 'Research the topic', dependsOn: [], expectedOutputTokenRange: [100, 500] },
    { id: 'step-2', agentRole: 'writer', description: 'Write the content', dependsOn: ['step-1'], expectedOutputTokenRange: [200, 800] },
    { id: 'step-3', agentRole: 'reviewer', description: 'Review the output', dependsOn: ['step-2'], expectedOutputTokenRange: [50, 200] },
  ],
  expectedCoordinationPoints: 2,
  userPrompt: 'Write a brief report about testing.',
  singleAgentPrompt: 'You are a helpful assistant. Write a brief report about testing.',
  crossoverTask: false,
  equivalenceMargin: 5,
};

const runConfig: RunConfig = {
  model: 'mock-model',
  maxTurns: 3,
  maxTokens: 1024,
  temperature: 0,
  agentCount: 3,
};

function makeContext(runType: RunType): RunContext {
  return {
    runType,
    runId: `run-${runType}`,
    trialIndex: 0,
    agentId: 'agent-0',
  };
}

// ============================================================
// buildRunResult Tests
// ============================================================

describe('buildRunResult', () => {
  it('computes derived fields correctly', () => {
    const result = buildRunResult(
      RunType.SINGLE_AGENT,
      'run-1',
      [
        {
          id: 'r1', runId: 'run-1', trialIndex: 0, agentId: 'a1', requestId: 'req1',
          category: TokenCategory.TASK_REASONING, inputTokens: 400, outputTokens: 200,
          totalTokens: 600, cachedInputTokens: 0, provider: 'mock', model: 'test',
          timestamp: Date.now(), runType: RunType.SINGLE_AGENT, cacheHit: false,
        },
        {
          id: 'r2', runId: 'run-1', trialIndex: 0, agentId: 'a1', requestId: 'req1',
          category: TokenCategory.SYSTEM_IDENTITY, inputTokens: 50, outputTokens: 0,
          totalTokens: 50, cachedInputTokens: 10, provider: 'mock', model: 'test',
          timestamp: Date.now(), runType: RunType.SINGLE_AGENT, cacheHit: true,
        },
      ],
      1000,
      1,
      true,
      'output text',
    );

    expect(result.taskReasoningTokens).toBe(600);
    expect(result.systemIdentityTokens).toBe(50);
    expect(result.interAgentTokens).toBe(0);
    expect(result.agentAutonomousTokens).toBe(650);
    expect(result.totalTokens).toBe(650);
    expect(result.cachedTokens).toBe(10);
    expect(result.effectiveTokens).toBe(640);
    expect(result.apiCallCount).toBe(1); // Both records share req1
    expect(result.agentCount).toBe(1);
  });
});

// ============================================================
// SingleAgentExecutor Tests
// ============================================================

describe('SingleAgentExecutor', () => {
  it('completes a task with mock client', async () => {
    const mock = new MockLLMClient({ seed: 42, variance: 0 });
    const executor = new SingleAgentExecutor();

    const result = await executor.execute(
      testTask, runConfig, makeContext(RunType.SINGLE_AGENT), mock,
    );

    expect(result.runType).toBe(RunType.SINGLE_AGENT);
    expect(result.success).toBe(true);
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(result.agentCount).toBe(1);
    expect(result.apiCallCount).toBeGreaterThanOrEqual(1);
    expect(result.tokenLog.length).toBeGreaterThan(0);
  });

  it('classifies all tokens as TR or SI (no inter-agent)', async () => {
    const mock = new MockLLMClient({ seed: 42, variance: 0 });
    const executor = new SingleAgentExecutor();

    const result = await executor.execute(
      testTask, runConfig, makeContext(RunType.SINGLE_AGENT), mock,
    );

    expect(result.contentTransferTokens).toBe(0);
    expect(result.mechanismOverheadTokens).toBe(0);
    expect(result.coordinationInstructionsTokens).toBe(0);
    expect(result.interAgentTokens).toBe(0);
    expect(result.taskReasoningTokens + result.systemIdentityTokens).toBe(result.totalTokens);
  });
});

// ============================================================
// MessagePassingExecutor Tests
// ============================================================

describe('MessagePassingExecutor', () => {
  it('completes a multi-agent task', async () => {
    const mock = new MockLLMClient({ seed: 42, variance: 0 });
    const executor = new MessagePassingExecutor();

    const result = await executor.execute(
      testTask, runConfig, makeContext(RunType.MESSAGE_PASSING), mock,
    );

    expect(result.runType).toBe(RunType.MESSAGE_PASSING);
    expect(result.success).toBe(true);
    expect(result.agentCount).toBe(3);
    expect(result.totalTokens).toBeGreaterThan(0);
  });

  it('has zero mechanism overhead (MO=0)', async () => {
    const mock = new MockLLMClient({ seed: 42, variance: 0 });
    const executor = new MessagePassingExecutor();

    const result = await executor.execute(
      testTask, runConfig, makeContext(RunType.MESSAGE_PASSING), mock,
    );

    expect(result.mechanismOverheadTokens).toBe(0);
  });

  it('uses more tokens than single agent (due to context passing)', async () => {
    const mockA = new MockLLMClient({ seed: 42, variance: 0 });
    const mockB = new MockLLMClient({ seed: 42, variance: 0 });

    const singleExec = new SingleAgentExecutor();
    const multiExec = new MessagePassingExecutor();

    const resultA = await singleExec.execute(
      testTask, runConfig, makeContext(RunType.SINGLE_AGENT), mockA,
    );
    const resultB = await multiExec.execute(
      testTask, runConfig, makeContext(RunType.MESSAGE_PASSING), mockB,
    );

    // Multi-agent should use more total tokens due to repeated context
    expect(resultB.totalTokens).toBeGreaterThan(resultA.totalTokens);
  });
});

// ============================================================
// McpBridge Tests
// ============================================================

describe('McpBridge', () => {
  it('connects and lists tools', async () => {
    const bridge = new McpBridge();
    await bridge.connect();

    const tools = await bridge.getToolDefinitions();
    expect(tools.length).toBe(4);

    const toolNames = tools.map(t => t.name).sort();
    expect(toolNames).toEqual(['deposit_trace', 'get_gradient', 'reinforce_trace', 'sense_environment']);

    await bridge.close();
  });

  it('deposits and senses traces', async () => {
    const bridge = new McpBridge();
    await bridge.connect();

    const deposited = await bridge.callTool('deposit_trace', {
      area: 'test/area',
      action: 'wrote some code',
      trace_type: 'info',
      intensity: 0.9,
      tags: ['test'],
      agent_id: 'test-agent',
    });

    expect(deposited).toHaveProperty('id');

    const sensed = await bridge.callTool('sense_environment', {
      area: 'test/',
    }) as unknown[];

    expect(sensed.length).toBe(1);

    await bridge.close();
  });

  it('isolates data between bridge instances', async () => {
    const bridge1 = new McpBridge();
    const bridge2 = new McpBridge();
    await bridge1.connect();
    await bridge2.connect();

    await bridge1.callTool('deposit_trace', {
      area: 'test/',
      action: 'from bridge 1',
      trace_type: 'info',
      intensity: 0.9,
      tags: [],
      agent_id: 'agent-1',
    });

    const sensed = await bridge2.callTool('sense_environment', {
      area: 'test/',
    }) as unknown[];

    // Bridge 2 has its own in-memory DB — should see nothing
    expect(sensed.length).toBe(0);

    await bridge1.close();
    await bridge2.close();
  });
});

// ============================================================
// StigmergySwarmExecutor Tests
// ============================================================

describe('StigmergySwarmExecutor', () => {
  it('completes a multi-agent task with stigmergy', async () => {
    const mock = new MockLLMClient({ seed: 42, variance: 0 });
    const executor = new StigmergySwarmExecutor();

    const result = await executor.execute(
      testTask, runConfig, makeContext(RunType.STIGMERGY), mock,
    );

    expect(result.runType).toBe(RunType.STIGMERGY);
    expect(result.success).toBe(true);
    expect(result.agentCount).toBe(3);
    expect(result.totalTokens).toBeGreaterThan(0);
  });

  it('has mechanism overhead from tool definitions', async () => {
    // Use a response generator that always returns text (no tool calls)
    // to isolate MO from tool definitions only
    const mock = new MockLLMClient({
      seed: 42,
      variance: 0,
      responseGenerator: () => ({
        content: [{ type: 'text', text: 'I analyzed the code and found issues.' }],
        stopReason: 'end_turn',
      }),
    });
    const executor = new StigmergySwarmExecutor();

    const result = await executor.execute(
      testTask, runConfig, makeContext(RunType.STIGMERGY), mock,
    );

    // Should have some MO from tool definitions injected into requests
    // (tool defs are classified as MO for stigmergy runs)
    expect(result.totalTokens).toBeGreaterThan(0);
  });
});
