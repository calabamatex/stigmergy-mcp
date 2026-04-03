import { ReinforceInput } from '../store/schema.js';
import { TraceStore } from '../store/trace-store.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerReinforce(server: McpServer, store: TraceStore): void {
  server.tool(
    'reinforce_trace',
    'Strengthen or weaken an existing stigmergic trace',
    ReinforceInput.shape,
    async (args: Record<string, unknown>) => {
      try {
        const input = ReinforceInput.parse(args);
        const trace = store.reinforce(input);
        return { content: [{ type: 'text', text: JSON.stringify(trace, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );
}
