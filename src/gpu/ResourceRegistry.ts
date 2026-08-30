export interface DestroyableResource {
  destroy(): void;
}

interface ResourceEntry {
  readonly label: string;
  readonly resource: DestroyableResource;
}

export interface ResourceRegistrySnapshot {
  readonly created: number;
  readonly destroyed: number;
  readonly active: number;
}

const counters = { created: 0, destroyed: 0, active: 0 };

export function captureResourceRegistrySnapshot(): ResourceRegistrySnapshot {
  return { ...counters };
}

export class ResourceRegistry {
  readonly #entries: ResourceEntry[] = [];
  #destroyed = false;

  public get size(): number {
    return this.#entries.length;
  }

  public register<T extends DestroyableResource>(resource: T, label: string): T {
    if (this.#destroyed) throw new Error('Cannot register a resource after registry destruction');
    this.#entries.push({ resource, label });
    counters.created += 1;
    counters.active += 1;
    return resource;
  }

  public destroyAll(onError?: (label: string, error: unknown) => void): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (let index = this.#entries.length - 1; index >= 0; index -= 1) {
      const entry = this.#entries[index];
      if (entry === undefined) continue;
      try {
        entry.resource.destroy();
      } catch (error) {
        onError?.(entry.label, error);
      } finally {
        counters.destroyed += 1;
        counters.active -= 1;
      }
    }
    this.#entries.length = 0;
  }
}
