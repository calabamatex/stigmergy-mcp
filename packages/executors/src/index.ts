export type { RunExecutor, RunConfig } from './executor.js';
export { buildRunResult } from './executor.js';
export { SingleAgentExecutor } from './single-agent.js';
export { MessagePassingExecutor } from './message-passing.js';
export { StigmergySwarmExecutor } from './stigmergy-swarm.js';
export { McpBridge } from './mcp-bridge.js';
export {
  singleAgentSystemPrompt,
  messagePassingSystemPrompt,
  messagePassingHandoff,
  stigmergySystemPrompt,
} from './agent-prompt.js';
