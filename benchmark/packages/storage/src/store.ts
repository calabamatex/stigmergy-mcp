import Database from 'better-sqlite3';
import type {
  TokenUsageRecord,
  TrialResult,
  ComparisonResult,
} from '@stigmergy-benchmark/core';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS token_usage (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    trial_index INTEGER NOT NULL,
    agent_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    category TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    cached_input_tokens INTEGER NOT NULL DEFAULT 0,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    run_type TEXT NOT NULL,
    cache_hit INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS trial_results (
    id TEXT PRIMARY KEY,
    comparison_id TEXT NOT NULL,
    trial_index INTEGER NOT NULL,
    single_agent_data TEXT NOT NULL,
    message_passing_data TEXT NOT NULL,
    stigmergy_data TEXT NOT NULL,
    cross_validation_data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comparison_results (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    task_name TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    config_data TEXT NOT NULL,
    stats_data TEXT NOT NULL,
    calibration_data TEXT NOT NULL,
    trial_count INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tokens_run ON token_usage(run_id);
  CREATE INDEX IF NOT EXISTS idx_tokens_trial ON token_usage(run_id, trial_index);
  CREATE INDEX IF NOT EXISTS idx_trials_comparison ON trial_results(comparison_id);
  CREATE INDEX IF NOT EXISTS idx_comparisons_task ON comparison_results(task_id);
`;

export class BenchmarkStore {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  saveTokenUsage(record: TokenUsageRecord): void {
    this.db.prepare(`
      INSERT INTO token_usage (
        id, run_id, trial_index, agent_id, request_id, category,
        input_tokens, output_tokens, total_tokens, cached_input_tokens,
        provider, model, timestamp, run_type, cache_hit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id, record.runId, record.trialIndex, record.agentId,
      record.requestId, record.category, record.inputTokens,
      record.outputTokens, record.totalTokens, record.cachedInputTokens,
      record.provider, record.model, record.timestamp, record.runType,
      record.cacheHit ? 1 : 0,
    );
  }

  getTokenUsage(runId: string, trialIndex?: number): TokenUsageRecord[] {
    const query = trialIndex !== undefined
      ? this.db.prepare('SELECT * FROM token_usage WHERE run_id = ? AND trial_index = ?')
      : this.db.prepare('SELECT * FROM token_usage WHERE run_id = ?');

    const rows = trialIndex !== undefined
      ? query.all(runId, trialIndex) as Record<string, unknown>[]
      : query.all(runId) as Record<string, unknown>[];

    return rows.map(row => ({
      id: row.id as string,
      runId: row.run_id as string,
      trialIndex: row.trial_index as number,
      agentId: row.agent_id as string,
      requestId: row.request_id as string,
      category: row.category as TokenUsageRecord['category'],
      inputTokens: row.input_tokens as number,
      outputTokens: row.output_tokens as number,
      totalTokens: row.total_tokens as number,
      cachedInputTokens: row.cached_input_tokens as number,
      provider: row.provider as string,
      model: row.model as string,
      timestamp: row.timestamp as number,
      runType: row.run_type as TokenUsageRecord['runType'],
      cacheHit: (row.cache_hit as number) === 1,
    }));
  }

  saveTrialResult(trial: TrialResult): void {
    const id = `${trial.comparisonId}-trial-${trial.trialIndex}`;
    this.db.prepare(`
      INSERT INTO trial_results (
        id, comparison_id, trial_index,
        single_agent_data, message_passing_data, stigmergy_data,
        cross_validation_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, trial.comparisonId, trial.trialIndex,
      JSON.stringify(trial.singleAgent),
      JSON.stringify(trial.messagePassing),
      JSON.stringify(trial.stigmergy),
      JSON.stringify(trial.crossValidation),
    );
  }

  getTrialResults(comparisonId: string): TrialResult[] {
    const rows = this.db.prepare(
      'SELECT * FROM trial_results WHERE comparison_id = ? ORDER BY trial_index',
    ).all(comparisonId) as Record<string, unknown>[];

    return rows.map(row => ({
      trialIndex: row.trial_index as number,
      comparisonId: row.comparison_id as string,
      singleAgent: JSON.parse(row.single_agent_data as string),
      messagePassing: JSON.parse(row.message_passing_data as string),
      stigmergy: JSON.parse(row.stigmergy_data as string),
      crossValidation: JSON.parse(row.cross_validation_data as string),
    }));
  }

  saveComparisonResult(result: ComparisonResult): void {
    this.db.prepare(`
      INSERT INTO comparison_results (
        id, task_id, task_name, timestamp,
        config_data, stats_data, calibration_data, trial_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      result.id, result.taskId, result.taskName, result.timestamp,
      JSON.stringify(result.config),
      JSON.stringify(result.stats),
      JSON.stringify(result.crossValidationCalibration),
      result.trials.length,
    );
  }

  getComparisonResult(id: string): ComparisonResult | null {
    const row = this.db.prepare(
      'SELECT * FROM comparison_results WHERE id = ?',
    ).get(id) as Record<string, unknown> | undefined;

    if (!row) return null;

    const trials = this.getTrialResults(id);
    return {
      id: row.id as string,
      taskId: row.task_id as string,
      taskName: row.task_name as string,
      timestamp: row.timestamp as number,
      config: JSON.parse(row.config_data as string),
      trials,
      stats: JSON.parse(row.stats_data as string),
      crossValidationCalibration: JSON.parse(row.calibration_data as string),
    };
  }

  listComparisons(): Array<{ id: string; taskName: string; timestamp: number; trialCount: number }> {
    const rows = this.db.prepare(
      'SELECT id, task_name, timestamp, trial_count FROM comparison_results ORDER BY timestamp DESC',
    ).all() as Array<{ id: string; task_name: string; timestamp: number; trial_count: number }>;

    return rows.map(row => ({
      id: row.id,
      taskName: row.task_name,
      timestamp: row.timestamp,
      trialCount: row.trial_count,
    }));
  }

  /** Clear signals/artifacts for next trial but preserve token records. */
  resetTrial(): void {
    // Token usage records persist across trials (they carry trial_index).
    // This method is a hook for executors that maintain ephemeral state.
  }

  close(): void {
    this.db.close();
  }
}
