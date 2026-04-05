import { RunType, type BenchmarkTask, type RunResult, type RunContext, type Message } from '@stigmergy-benchmark/core';
import type { LLMClient } from '@stigmergy-benchmark/llm-client';
import { TokenTracker, InstrumentedLLMClient } from '@stigmergy-benchmark/llm-client';
import { RuleClassifier } from '@stigmergy-benchmark/classifier';
import type { RunExecutor, RunConfig } from './executor.js';
import { buildRunResult } from './executor.js';
import { singleAgentSystemPrompt } from './agent-prompt.js';

/**
 * Run A: Single autonomous agent completes the entire task.
 * Establishes the empirical cost floor — no coordination overhead.
 *
 * Agent loop: LLM call → check stop → repeat until done or max turns.
 */
export class SingleAgentExecutor implements RunExecutor {
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

    const agentContext: RunContext = {
      ...context,
      runType: RunType.SINGLE_AGENT,
    };

    const messages: Message[] = [
      { role: 'system', content: singleAgentSystemPrompt(task) },
      { role: 'user', content: task.userPrompt },
    ];

    const start = Date.now();
    let lastOutput = '';

    for (let turn = 0; turn < config.maxTurns; turn++) {
      const response = await instrumented.complete({
        model: config.model,
        messages,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        context: agentContext,
      });

      // Collect text output
      const textBlocks = response.content.filter(b => b.type === 'text');
      if (textBlocks.length > 0) {
        lastOutput = textBlocks.map(b => b.text ?? '').join('\n');
      }

      // Append assistant response to conversation
      messages.push({ role: 'assistant', content: response.content });

      // Check if the agent is done
      if (response.stopReason === 'end_turn' || response.stopReason === 'stop') {
        break;
      }

      // If tool_use, simulate tool result and continue
      if (response.stopReason === 'tool_use') {
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            messages.push({
              role: 'tool',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: JSON.stringify({ status: 'ok', result: 'mock tool result' }),
                },
              ],
            });
          }
        }
      }
    }

    const wallClockMs = Date.now() - start;

    return buildRunResult(
      RunType.SINGLE_AGENT,
      context.runId,
      tracker.getRecords(),
      wallClockMs,
      1,
      true,
      lastOutput,
    );
  }
}
