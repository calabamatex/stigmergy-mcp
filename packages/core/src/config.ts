import { z } from 'zod';

export const BenchmarkConfigSchema = z.object({
  trialCount: z.number().int().min(3).max(100).default(10),
  provider: z.enum(['anthropic', 'openai', 'mock']).default('anthropic'),
  model: z.string().default('claude-sonnet-4-20250514'),
  temperature: z.number().min(0).max(2).default(0),
  maxTokensPerCall: z.number().int().min(100).max(200000).default(4096),
  promptCachingEnabled: z.boolean().default(true),
  skipSingleAgent: z.boolean().default(false),
  seed: z.number().int().optional(),
  tokenBudgetPerTrial: z.number().int().optional(),
});

export type BenchmarkConfig = z.infer<typeof BenchmarkConfigSchema>;
