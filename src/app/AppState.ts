export const APP_STATES = [
  'idle',
  'initializing',
  'ready',
  'running',
  'paused',
  'recovering',
  'failed',
  'disposed',
] as const;

export type AppState = (typeof APP_STATES)[number];
export type AppStateListener = (current: AppState, previous: AppState) => void;

const TRANSITIONS: Readonly<Record<AppState, readonly AppState[]>> = {
  idle: ['initializing', 'disposed'],
  initializing: ['ready', 'failed', 'recovering', 'disposed'],
  ready: ['running', 'recovering', 'failed', 'disposed'],
  running: ['paused', 'recovering', 'failed', 'disposed'],
  paused: ['running', 'recovering', 'failed', 'disposed'],
  recovering: ['initializing', 'failed', 'disposed'],
  failed: ['initializing', 'disposed'],
  disposed: [],
};

export class InvalidAppStateTransitionError extends Error {
  public constructor(from: AppState, to: AppState) {
    super(`Invalid application state transition: ${from} -> ${to}`);
    this.name = 'InvalidAppStateTransitionError';
  }
}

export class AppStateStore {
  readonly #listeners = new Set<AppStateListener>();
  #current: AppState = 'idle';

  public get current(): AppState {
    return this.#current;
  }

  public canTransition(to: AppState): boolean {
    return this.#current === to || TRANSITIONS[this.#current].includes(to);
  }

  public transition(to: AppState): boolean {
    const previous = this.#current;
    if (previous === to) return false;
    if (!TRANSITIONS[previous].includes(to)) {
      throw new InvalidAppStateTransitionError(previous, to);
    }

    this.#current = to;
    for (const listener of this.#listeners) listener(to, previous);
    return true;
  }

  public subscribe(listener: AppStateListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
