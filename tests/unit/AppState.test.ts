import { AppStateStore, InvalidAppStateTransitionError } from '../../src/app/AppState';

describe('AppStateStore', () => {
  it('follows the normal lifecycle and treats same-state transitions as idempotent', () => {
    const store = new AppStateStore();
    expect(store.current).toBe('idle');
    expect(store.transition('idle')).toBe(false);
    expect(store.transition('initializing')).toBe(true);
    expect(store.transition('ready')).toBe(true);
    expect(store.transition('running')).toBe(true);
    expect(store.transition('paused')).toBe(true);
    expect(store.transition('running')).toBe(true);
    expect(store.transition('disposed')).toBe(true);
    expect(store.current).toBe('disposed');
  });

  it('supports failure, retry, and recovery paths', () => {
    const failed = new AppStateStore();
    failed.transition('initializing');
    failed.transition('failed');
    failed.transition('initializing');
    failed.transition('ready');
    failed.transition('running');
    failed.transition('recovering');
    failed.transition('initializing');
    expect(failed.current).toBe('initializing');
  });

  it('rejects invalid transitions and cannot leave disposed', () => {
    const store = new AppStateStore();
    expect(() => store.transition('running')).toThrow(InvalidAppStateTransitionError);
    store.transition('disposed');
    expect(store.canTransition('initializing')).toBe(false);
    expect(() => store.transition('initializing')).toThrow(
      'Invalid application state transition: disposed -> initializing',
    );
  });

  it('notifies subscribers exactly once per actual transition', () => {
    const store = new AppStateStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.transition('initializing');
    store.transition('initializing');
    unsubscribe();
    store.transition('failed');
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('initializing', 'idle');
  });
});
