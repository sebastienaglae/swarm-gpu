export const STRESS_SCENARIO_VERSION = '1.0.0';

export const STRESS_KINDS = [
  'soak',
  'resize',
  'pause-resume',
  'quality',
  'rebuild',
  'visibility',
  'recovery',
  'capacity',
] as const;

export type StressKind = (typeof STRESS_KINDS)[number];

export interface StressScenario {
  readonly scenarioVersion: typeof STRESS_SCENARIO_VERSION;
  readonly id: string;
  readonly kind: StressKind;
  readonly population: number;
  readonly durationSeconds: number;
  readonly repetitions: number;
  readonly timeoutSeconds: number;
  readonly screenshot?: boolean;
}

export function parseStressScenarios(value: unknown): readonly StressScenario[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('Stress scenario suite must be a non-empty array');
  }
  const ids = new Set<string>();
  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new TypeError(`Stress scenario ${String(index)} must be an object`);
    }
    const scenario = entry as Partial<StressScenario>;
    if (scenario.scenarioVersion !== STRESS_SCENARIO_VERSION) {
      throw new RangeError(`Stress scenario ${String(index)} has an incompatible version`);
    }
    if (typeof scenario.id !== 'string' || scenario.id.trim().length === 0) {
      throw new TypeError(`Stress scenario ${String(index)} requires an ID`);
    }
    if (ids.has(scenario.id)) throw new RangeError(`Duplicate stress scenario ID ${scenario.id}`);
    ids.add(scenario.id);
    if (!STRESS_KINDS.some((kind) => kind === scenario.kind)) {
      throw new RangeError(`Stress scenario ${scenario.id} has an unsupported kind`);
    }
    requireInteger(scenario.population, scenario.id, 'population', 1, 1_000_000);
    requireFinite(scenario.durationSeconds, scenario.id, 'durationSeconds', 0);
    requireInteger(scenario.repetitions, scenario.id, 'repetitions', 0);
    requireInteger(scenario.timeoutSeconds, scenario.id, 'timeoutSeconds', 1);
    if (scenario.kind === 'soak' && scenario.durationSeconds === 0) {
      throw new RangeError(`Stress scenario ${scenario.id} requires a positive duration`);
    }
    if (scenario.kind !== 'soak' && scenario.repetitions === 0) {
      throw new RangeError(`Stress scenario ${scenario.id} requires positive repetitions`);
    }
    return scenario as StressScenario;
  });
}

function requireInteger(
  value: unknown,
  id: string,
  field: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${id}.${field} must be a safe integer in range`);
  }
}

function requireFinite(
  value: unknown,
  id: string,
  field: string,
  minimum: number,
): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new RangeError(`${id}.${field} must be a finite number in range`);
  }
}
