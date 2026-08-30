import { ResourceRegistry } from '../../src/gpu/ResourceRegistry';

describe('ResourceRegistry', () => {
  it('destroys resources in reverse registration order exactly once', () => {
    const order: string[] = [];
    const registry = new ResourceRegistry();
    registry.register({ destroy: () => order.push('first') }, 'first');
    registry.register({ destroy: () => order.push('second') }, 'second');
    expect(registry.size).toBe(2);
    registry.destroyAll();
    registry.destroyAll();
    expect(order).toEqual(['second', 'first']);
    expect(registry.size).toBe(0);
  });

  it('continues destruction after an error and reports the owner label', () => {
    const destroyed = vi.fn();
    const onError = vi.fn();
    const registry = new ResourceRegistry();
    registry.register({ destroy: destroyed }, 'safe-buffer');
    registry.register(
      {
        destroy: () => {
          throw new Error('driver error');
        },
      },
      'broken-texture',
    );
    registry.destroyAll(onError);
    expect(destroyed).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith('broken-texture', expect.any(Error));
  });

  it('rejects registration after destruction', () => {
    const registry = new ResourceRegistry();
    registry.destroyAll();
    expect(() => registry.register({ destroy: vi.fn() }, 'late')).toThrow(
      'Cannot register a resource after registry destruction',
    );
  });
});
