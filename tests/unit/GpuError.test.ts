import { GpuInitializationError, toUserFacingError } from '../../src/gpu/GpuError';

describe('GPU initialization errors', () => {
  it('maps known failures to actionable messages', () => {
    const error = new GpuInitializationError('WEBGPU_UNAVAILABLE');
    expect(error.code).toBe('WEBGPU_UNAVAILABLE');
    expect(toUserFacingError(error)).toContain('current Chrome or Edge');
  });

  it('does not expose arbitrary raw errors to the user', () => {
    expect(toUserFacingError(new Error('secret internal detail'))).not.toContain(
      'secret internal detail',
    );
  });
});
