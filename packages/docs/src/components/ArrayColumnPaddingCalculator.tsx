import { JSX, useEffect, useState } from 'react';
import styles from './ArrayColumnPaddingCalculator.module.css';

type CalculationMode = 'forward' | 'reverse';

/**
 * Calculate Poisson CDF: P(X ≤ k) for X ~ Poisson(λ)
 */
function poissonCDF(k: number, lambda: number): number {
  let sum = 0;
  let term = Math.exp(-lambda); // P(X = 0)
  sum += term;

  for (let i = 1; i <= k; i++) {
    term *= lambda / i; // P(X = i)
    sum += term;
  }

  return sum;
}

/**
 * Find lambda such that P(X ≤ 3) ≤ (1-p)^(1/m) using binary search
 */
function findLambda(m: number, p: number): number {
  const targetCDF = Math.pow(1 - p, 1 / m);
  let low = 0.1;
  let high = 20;

  while (high - low > 0.01) {
    const mid = (low + high) / 2;
    if (poissonCDF(3, mid) > targetCDF) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}

/**
 * Find m such that P(X ≤ 3) ≤ (1-p)^(1/m) for a given lambda
 */
function findM(lambda: number, p: number): number {
  const cdf = poissonCDF(3, lambda);
  if (cdf >= 1 - p) {
    return 1; // Minimum m
  }

  // Solve: cdf = (1-p)^(1/m)
  // log(cdf) = log(1-p) / m
  // m = log(1-p) / log(cdf)
  const m = Math.log(1 - p) / Math.log(cdf);
  return Math.max(1, Math.round(m));
}

export default function ArrayColumnPaddingCalculator(): JSX.Element {
  const [mode, setMode] = useState<CalculationMode>('forward');

  // Forward mode inputs (stored as strings to allow empty state)
  const [mInput, setMInput] = useState<string>('20');
  const [pInput, setPInput] = useState<string>('0.99999');
  const [statisticsTargetInput, setStatisticsTargetInput] = useState<string>('100');

  // Reverse mode inputs
  const [desiredFrequencyInput, setDesiredFrequencyInput] = useState<string>('0.25');

  // Calculated outputs
  const [lambda, setLambda] = useState<number>(0);
  const [frequencyPercent, setFrequencyPercent] = useState<number>(0);
  const [rowsPerHundredK, setRowsPerHundredK] = useState<number>(0);
  const [calculatedM, setCalculatedM] = useState<number>(0);

  useEffect(() => {
    // Parse inputs with defaults
    const m = Math.max(1, Math.min(1000, parseInt(mInput) || 20));
    const p = Math.max(0.9, Math.min(0.999999, parseFloat(pInput) || 0.99999));
    const statisticsTarget = Math.max(1, Math.min(10000, parseInt(statisticsTargetInput) || 100));
    const desiredFrequencyPercent = Math.max(0.01, Math.min(1, parseFloat(desiredFrequencyInput) || 0.25));

    if (mode === 'forward') {
      // Calculate lambda from m, p, statisticsTarget
      const calculatedLambda = findLambda(m, p);
      setLambda(calculatedLambda);

      const R = statisticsTarget * 300;
      const frequency = (m * calculatedLambda) / R;
      const freqPercent = frequency * 100;

      setFrequencyPercent(freqPercent);
      setRowsPerHundredK(Math.round(frequency * 100000));
    } else {
      // Reverse: Calculate m and lambda from desired frequency
      const frequency = desiredFrequencyPercent / 100;
      const R = statisticsTarget * 300;
      const calculatedLambda = (frequency * R) / 10; // Start with assumption m=10

      // Find appropriate lambda for this frequency
      let bestM = 10;
      let bestLambda = calculatedLambda;

      // Iterate to find good m and lambda combination
      for (let testM = 1; testM <= 100; testM++) {
        const testLambda = findLambda(testM, p);
        const testFreq = (testM * testLambda) / R;
        const testFreqPercent = testFreq * 100;

        if (Math.abs(testFreqPercent - desiredFrequencyPercent) < 0.01) {
          bestM = testM;
          bestLambda = testLambda;
          break;
        }
      }

      setCalculatedM(bestM);
      setLambda(bestLambda);
      setFrequencyPercent(((bestM * bestLambda) / R) * 100);
      setRowsPerHundredK(Math.round(((bestM * bestLambda) / R) * 100000));
    }
  }, [mode, mInput, pInput, statisticsTargetInput, desiredFrequencyInput]);

  // Parse for display
  const statisticsTarget = Math.max(1, Math.min(10000, parseInt(statisticsTargetInput) || 100));
  const m = Math.max(1, Math.min(1000, parseInt(mInput) || 20));

  const cutoffFreq = Math.ceil((9 * 2 * statisticsTarget * 300) / ((statisticsTarget * 10 * 1000) / 7));

  const configJSON =
    mode === 'forward'
      ? `{
  "arrayColumnPadding": {
    "identifier": {
      "resourceType": ["Patient", "Observation"],
      "config": {
        "m": ${m},
        "lambda": ${Math.round(lambda * 10) / 10},
        "statisticsTarget": ${statisticsTarget}
      }
    }
  }
}`
      : `{
  "arrayColumnPadding": {
    "identifier": {
      "resourceType": ["Patient", "Observation"],
      "config": {
        "m": ${calculatedM},
        "lambda": ${Math.round(lambda * 10) / 10},
        "statisticsTarget": ${statisticsTarget}
      }
    }
  }
}`;

  const handleCopyConfig = (): void => {
    navigator.clipboard.writeText(configJSON);
  };

  return (
    <div className={styles.calculator}>
      <div className={styles.modeToggle}>
        <button className={mode === 'forward' ? styles.activeMode : ''} onClick={() => setMode('forward')}>
          Forward: Calculate λ
        </button>
        <button className={mode === 'reverse' ? styles.activeMode : ''} onClick={() => setMode('reverse')}>
          Reverse: Calculate m
        </button>
      </div>

      <div className={styles.inputSection}>
        <h4>Input Parameters</h4>

        {mode === 'forward' ? (
          <>
            <div className={styles.inputGroup}>
              <label htmlFor="m-input">
                <strong>m</strong> - Number of distinct padding elements
                <span className={styles.helpText}>
                  More padding elements (higher m) means lower frequency per element. Range: 1-1000
                </span>
              </label>
              <input
                id="m-input"
                type="number"
                min="1"
                max="1000"
                value={mInput}
                onChange={(e) => setMInput(e.target.value)}
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="p-input">
                <strong>p</strong> - Confidence level
                <span className={styles.helpText}>
                  Probability that at least one padding element will be in MCE. Common: 0.9999, 0.99999, 0.999999
                </span>
              </label>
              <input
                id="p-input"
                type="number"
                min="0.9"
                max="0.999999"
                step="0.00001"
                value={pInput}
                onChange={(e) => setPInput(e.target.value)}
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="stats-target-input">
                <strong>statisticsTarget</strong> - PostgreSQL statistics target
                <span className={styles.helpText}>
                  Should match your database column's statistics target. Default: 100
                </span>
              </label>
              <input
                id="stats-target-input"
                type="number"
                min="1"
                max="10000"
                value={statisticsTargetInput}
                onChange={(e) => setStatisticsTargetInput(e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <div className={styles.inputGroup}>
              <label htmlFor="freq-input">
                <strong>Desired Frequency</strong> - Target percentage of rows with padding
                <span className={styles.helpText}>
                  Percentage of rows that will contain a padding element. Range: 0.01%-1%
                </span>
              </label>
              <div className={styles.inputWithUnit}>
                <input
                  id="freq-input"
                  type="number"
                  min="0.01"
                  max="1"
                  step="0.01"
                  value={desiredFrequencyInput}
                  onChange={(e) => setDesiredFrequencyInput(e.target.value)}
                />
                <span>%</span>
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="p-input-reverse">
                <strong>p</strong> - Confidence level
                <span className={styles.helpText}>
                  Probability that at least one padding element will be in MCE. Common: 0.9999, 0.99999, 0.999999
                </span>
              </label>
              <input
                id="p-input-reverse"
                type="number"
                min="0.9"
                max="0.999999"
                step="0.00001"
                value={pInput}
                onChange={(e) => setPInput(e.target.value)}
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="stats-target-input-reverse">
                <strong>statisticsTarget</strong> - PostgreSQL statistics target
                <span className={styles.helpText}>
                  Should match your database column's statistics target. Default: 100
                </span>
              </label>
              <input
                id="stats-target-input-reverse"
                type="number"
                min="1"
                max="10000"
                value={statisticsTargetInput}
                onChange={(e) => setStatisticsTargetInput(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <div className={styles.outputSection}>
        <h4>Calculated Results</h4>

        <div className={styles.resultGrid}>
          {mode === 'reverse' && (
            <div className={styles.resultItem}>
              <span className={styles.resultLabel}>Recommended m:</span>
              <span className={styles.resultValue}>{calculatedM}</span>
            </div>
          )}

          <div className={styles.resultItem}>
            <span className={styles.resultLabel}>Lambda (λ):</span>
            <span className={styles.resultValue}>{lambda.toFixed(2)}</span>
          </div>

          <div className={styles.resultItem}>
            <span className={styles.resultLabel}>Frequency:</span>
            <span className={styles.resultValue}>{frequencyPercent.toFixed(3)}%</span>
          </div>

          <div className={styles.resultItem}>
            <span className={styles.resultLabel}>Affected rows per 100k:</span>
            <span className={styles.resultValue}>{rowsPerHundredK.toLocaleString()}</span>
          </div>

          <div className={styles.resultItem}>
            <span className={styles.resultLabel}>Cutoff frequency:</span>
            <span className={styles.resultValue}>{cutoffFreq}</span>
          </div>
        </div>

        <div className={styles.explanation}>
          <p>
            <strong>Interpretation:</strong> With these settings, padding elements will be added to approximately{' '}
            <strong>{frequencyPercent.toFixed(2)}%</strong> of rows ({rowsPerHundredK.toLocaleString()} per 100,000
            rows). The cutoff frequency is <strong>{cutoffFreq}</strong>, meaning an element must appear at least this
            many times in the sample to be included in PostgreSQL's most_common_elements statistics.
          </p>
        </div>
      </div>

      <div className={styles.configSection}>
        <h4>Configuration JSON</h4>
        <div className={styles.configOutput}>
          <pre>{configJSON}</pre>
          <button onClick={handleCopyConfig} className={styles.copyButton}>
            Copy to Clipboard
          </button>
        </div>
      </div>
    </div>
  );
}
