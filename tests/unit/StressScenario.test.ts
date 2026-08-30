import { parseStressScenarios } from '../../src/diagnostics/StressScenario';

describe('Phase 07 stress scenario parsing', () => {
  it('accepts a valid versioned suite', () => {
    expect(
      parseStressScenarios([
        {
          scenarioVersion: '1.0.0',
          id: 'RESIZE',
          kind: 'resize',
          population: 10_000,
          durationSeconds: 0,
          repetitions: 25,
          timeoutSeconds: 30,
        },
      ]),
    ).toHaveLength(1);
  });

  it('rejects duplicate IDs and incompatible versions', () => {
    const scenario = {
      scenarioVersion: '1.0.0',
      id: 'SOAK',
      kind: 'soak',
      population: 10_000,
      durationSeconds: 1,
      repetitions: 0,
      timeoutSeconds: 2,
    };
    expect(() => parseStressScenarios([{ ...scenario }, { ...scenario }])).toThrow('Duplicate');
    expect(() => parseStressScenarios([{ ...scenario, scenarioVersion: '2.0.0' }])).toThrow(
      'incompatible',
    );
  });

  it('rejects unsafe populations, missing work, and non-finite durations', () => {
    const base = {
      scenarioVersion: '1.0.0',
      id: 'CASE',
      kind: 'soak',
      population: 10_000,
      durationSeconds: 1,
      repetitions: 0,
      timeoutSeconds: 2,
    };
    expect(() => parseStressScenarios([{ ...base, population: 1_000_001 }])).toThrow('population');
    expect(() => parseStressScenarios([{ ...base, durationSeconds: Number.NaN }])).toThrow(
      'durationSeconds',
    );
    expect(() => parseStressScenarios([{ ...base, durationSeconds: 0 }])).toThrow(
      'positive duration',
    );
    expect(() =>
      parseStressScenarios([{ ...base, kind: 'resize', durationSeconds: 0, repetitions: 0 }]),
    ).toThrow('positive repetitions');
  });
});
