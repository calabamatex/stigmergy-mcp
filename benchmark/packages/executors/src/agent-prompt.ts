import type { BenchmarkTask, TaskStep } from '@stigmergy-benchmark/core';

/**
 * System prompt for Run A: single agent completing the entire task.
 * Contains ONLY task description — no coordination instructions.
 */
export function singleAgentSystemPrompt(task: BenchmarkTask): string {
  return task.singleAgentPrompt || [
    `You are an expert assistant. Complete the following task thoroughly.`,
    ``,
    `Task: ${task.name}`,
    `${task.description}`,
    ``,
    `Instructions: ${task.userPrompt}`,
    ``,
    `Provide your complete output when done.`,
  ].join('\n');
}

/**
 * System prompt for Run B: message-passing swarm agent.
 * Contains base role + coordination instructions for receiving/passing work.
 */
export function messagePassingSystemPrompt(
  task: BenchmarkTask,
  step: TaskStep,
  agentIndex: number,
  totalAgents: number,
): string {
  return [
    `You are agent ${agentIndex + 1} of ${totalAgents}, role: ${step.agentRole}.`,
    ``,
    `Task: ${task.name}`,
    `${task.description}`,
    ``,
    `Your responsibility: ${step.description}`,
    ``,
    agentIndex === 0
      ? `You are the first agent. Start the task based on the user prompt.`
      : `The previous agent produced output that will be provided to you. Continue from where they left off.`,
    ``,
    `Provide your complete output when done.`,
  ].join('\n');
}

/**
 * Coordination message injected before agent N in Run B,
 * containing previous agents' outputs (= Content Transfer).
 */
export function messagePassingHandoff(
  previousOutputs: Array<{ agentRole: string; output: string }>,
): string {
  if (previousOutputs.length === 0) return '';

  const parts = previousOutputs.map(
    (p, i) => `--- Agent ${i + 1} (${p.agentRole}) output ---\n${p.output}`,
  );

  return [
    `The previous agent produced the following. Please review and continue:`,
    ``,
    ...parts,
  ].join('\n');
}

/**
 * System prompt for Run C: stigmergy swarm agent.
 * Contains base role + instructions to use stigmergy tools.
 */
export function stigmergySystemPrompt(
  task: BenchmarkTask,
  step: TaskStep,
  agentIndex: number,
  totalAgents: number,
): string {
  return [
    `You are agent ${agentIndex + 1} of ${totalAgents}, role: ${step.agentRole}.`,
    ``,
    `Task: ${task.name}`,
    `${task.description}`,
    ``,
    `Your responsibility: ${step.description}`,
    ``,
    `Use these tools in order:`,
    `1. sense_environment — check for traces left by other agents in the task area`,
    `2. Do your work based on what you find (or start fresh if no traces)`,
    `3. deposit_trace — leave a trace describing what you did and your output`,
    ``,
    `Provide your complete output when done.`,
  ].join('\n');
}
