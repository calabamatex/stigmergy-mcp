import { RunType, type BenchmarkTask, type RunResult, type RunContext, type Message } from '@stigmergy-benchmark/core';
import type { LLMClient } from '@stigmergy-benchmark/llm-client';
import { TokenTracker, InstrumentedLLMClient } from '@stigmergy-benchmark/llm-client';
import { RuleClassifier } from '@stigmergy-benchmark/classifier';
import type { RunExecutor, RunConfig } from './executor.js';
import { buildRunResult } from './executor.js';
import { messagePassingSystemPrompt, messagePassingHandoff } from './agent-prompt.js';

/**
 * Run B: Message-passing swarm.
 * Multiple agents coordinate via cumulative conversation history.
 *
 * Agent N receives:
 * - System prompt (role + coordination)
 * - User prompt (task)
 * - Handoff message with ALL previous agents' outputs (= Content Transfer)
 *
 * This is the control group. MO = 0 by design (no protocol layer).
 * CT grows O(N²) as each agent ingests all predecessors.
 */
export class MessagePassingExecutor implements RunExecutor {
  async execute(
    task: BenchmarkTask,
    config: RunConfig,
    context: RunContext,
    client: LLMClient,
  ): Promise<RunResult> {
    const tracker = new TokenTracker();
    const classifier = new RuleClassifier();
    const instrumented = new InstrumentedLLMClient(
      client, classifier, tracker, 'benchmark', config.model,
    );

    const steps = task.steps.slice(0, config.agentCount);
    const agentOutputs: Array<{ agentRole: string; output: string }> = [];

    const agentContext: RunContext = {
      ...context,
      runType: RunType.MESSAGE_PASSING,
    };

    const start = Date.now();
    let finalOutput = '';

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const messages: Message[] = [
        {
          role: 'system',
          content: messagePassingSystemPrompt(task, step, i, steps.length),
        },
        { role: 'user', content: task.userPrompt },
      ];

      // Inject previous agents' outputs as content transfer
      if (agentOutputs.length > 0) {
        const handoff = messagePassingHandoff(agentOutputs);
        messages.push({ role: 'user', content: handoff });
      }

      // Agent execution (single call per step for fair comparison)
      const agentCtx: RunContext = { ...agentContext, agentId: `agent-${i}` };

      let agentOutput = '';
      for (let turn = 0; turn < config.maxTurns; turn++) {
        const response = await instrumented.complete({
          model: config.model,
          messages,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
          context: agentCtx,
        });

        const textBlocks = response.content.filter(b => b.type === 'text');
        if (textBlocks.length > 0) {
          agentOutput = textBlocks.map(b => b.text ?? '').join('\n');
        }

        messages.push({ role: 'assistant', content: response.content });

        if (response.stopReason === 'end_turn' || response.stopReason === 'stop') {
          break;
        }

        // Handle tool calls (non-stigmergy tools the agent might use)
        if (response.stopReason === 'tool_use') {
          for (const block of response.content) {
            if (block.type === 'tool_use') {
              messages.push({
                role: 'tool',
                content: [{
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: JSON.stringify({ status: 'ok', result: 'mock tool result' }),
                }],
              });
            }
          }
        }
      }

      agentOutputs.push({ agentRole: step.agentRole, output: agentOutput });
      finalOutput = agentOutput;
    }

    const wallClockMs = Date.now() - start;

    return buildRunResult(
      RunType.MESSAGE_PASSING,
      context.runId,
      tracker.getRecords(),
      wallClockMs,
      steps.length,
      true,
      finalOutput,
    );
  }
}
