import type { ConfidenceInterval, DescriptiveStats } from '@stigmergy-benchmark/core';
import { bootstrapCI, type BootstrapConfig } from './bootstrap.js';

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const sumSq = values.reduce((acc, v) => acc + (v - m) ** 2, 0);
  return Math.sqrt(sumSq / (values.length - 1)); // sample std dev
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

export function cv(values: number[]): number {
  const m = mean(values);
  if (m === 0) return 0;
  return stdDev(values) / Math.abs(m);
}

export function computeDescriptiveStats(
  values: number[],
  bootstrapConfig?: BootstrapConfig,
): DescriptiveStats {
  const n = values.length;

  const ci: ConfidenceInterval = n >= 3
    ? bootstrapCI(values, bootstrapConfig)
    : { lower: NaN, upper: NaN, level: bootstrapConfig?.ciLevel ?? 0.95 };

  return {
    mean: mean(values),
    median: median(values),
    stdDev: stdDev(values),
    iqr: [percentile(values, 25), percentile(values, 75)],
    cv: cv(values),
    min: n > 0 ? Math.min(...values) : 0,
    max: n > 0 ? Math.max(...values) : 0,
    n,
    ci,
  };
}
