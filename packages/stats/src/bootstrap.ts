import type { ConfidenceInterval } from '@stigmergy-benchmark/core';
import { SeededRandom } from './prng.js';
import { median } from './descriptive.js';

export interface BootstrapConfig {
  resamples: number;
  ciLevel: number;
  seed?: number;
}

const DEFAULT_CONFIG: BootstrapConfig = {
  resamples: 10_000,
  ciLevel: 0.95,
};

/**
 * Bootstrap percentile confidence interval.
 * Resamples with replacement and computes the median of each resample.
 * Returns NaN bounds for n < 3.
 */
export function bootstrapCI(
  values: number[],
  config?: Partial<BootstrapConfig>,
): ConfidenceInterval {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (values.length < 3) {
    return { lower: NaN, upper: NaN, level: cfg.ciLevel };
  }

  const rng = new SeededRandom(cfg.seed);
  const n = values.length;
  const resampledMedians: number[] = new Array(cfg.resamples);

  for (let i = 0; i < cfg.resamples; i++) {
    const sample: number[] = new Array(n);
    for (let j = 0; j < n; j++) {
      sample[j] = values[rng.nextInt(n)];
    }
    resampledMedians[i] = median(sample);
  }

  resampledMedians.sort((a, b) => a - b);
  const alpha = 1 - cfg.ciLevel;
  const lowerIdx = Math.floor((alpha / 2) * cfg.resamples);
  const upperIdx = Math.floor((1 - alpha / 2) * cfg.resamples);

  return {
    lower: resampledMedians[lowerIdx],
    upper: resampledMedians[upperIdx],
    level: cfg.ciLevel,
  };
}
