import { RunType, type BenchmarkTask, type RunResult, type RunContext, type Message, type ContentBlock } from '@stigmergy-benchmark/core';
import type { LLMClient } from '@stigmergy-benchmark/llm-client';
import { TokenTracker, InstrumentedLLMClient } from '@stigmergy-benchmark/llm-client';
import { RuleClassifier } from '@stigmergy-benchmark/classifier';
import type { RunExecutor, RunConfig } from './executor.js';
import { buildRunResult } from './executor.js';
import { stigmergySystemPrompt } from './agent-prompt.js';
import { McpBridge } from './mcp-bridge.js';

/**
 * Run C: Stigmergy swarm.
 * Multiple agents coordinate via blackboard signals (stigmergy-mcp traces).
 *
 * Each agent:
 * 1. sense_environment — reads traces in the task area
 * 2. Does its work based on what it finds
 * 3. deposit_trace — leaves a trace describing what it did
 *
 * CT is minimal (just trace summaries, not full outputs).
 * MO = tool definition + tool call round-trip tokens.
 * This is the experimental group.
 */
export class StigmergySwarmExecutor implements RunExecutor {
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

    const bridge = new McpBridge();
    await bridge.connect();

    const agentContext: RunContext = {
      ...context,
      runType: RunType.STIGMERGY,
    };

    const steps = task.steps.slice(0, config.agentCount);
    const toolDefs = await bridge.getToolDefinitions();

    const start = Date.now();
    let finalOutput = '';

    try {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const agentCtx: RunContext = { ...agentContext, agentId: `agent-${i}` };

        const messages: Message[] = [
          {
            role: 'system',
            content: stigmergySystemPrompt(task, step, i, steps.length),
          },
          { role: 'user', content: task.userPrompt },
        ];

        let agentOutput = '';

        for (let turn = 0; turn < config.maxTurns; turn++) {
          const response = await instrumented.complete({
            model: config.model,
            messages,
            tools: toolDefs,
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

          // Handle tool calls — execute them against the MCP bridge
          if (response.stopReason === 'tool_use') {
            for (const block of response.content) {
              if (block.type === 'tool_use' && block.name) {
                let toolResult: unknown;
                try {
                  toolResult = await bridge.callTool(block.name, block.input ?? {});
                } catch (err) {
                  toolResult = { error: String(err) };
                }

                messages.push({
                  role: 'tool',
                  content: [{
                    type: 'tool_result',
                    tool_use_id: block.id,
                    content: JSON.stringify(toolResult),
                  }],
                });
              }
            }
          }
        }

        // After agent completes, deposit a trace summarizing its work
        // (if the agent didn't already do so via tool use)
        if (agentOutput) {
          try {
            await bridge.callTool('deposit_trace', {
              area: `task/${task.id}`,
              action: `${step.agentRole}: ${agentOutput.slice(0, 200)}`,
              trace_type: 'info',
              intensity: 0.8,
              tags: [step.agentRole, `step-${i}`],
              agent_id: `agent-${i}`,
            });
          } catch {
            // Non-fatal — trace deposit is best-effort
          }
        }

        finalOutput = agentOutput;
      }
    } finally {
      await bridge.close();
    }

    const wallClockMs = Date.now() - start;

    return buildRunResult(
      RunType.STIGMERGY,
      context.runId,
      tracker.getRecords(),
      wallClockMs,
      steps.length,
      true,
      finalOutput,
    );
  }
}
