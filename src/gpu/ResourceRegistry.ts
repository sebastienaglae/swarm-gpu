export interface DestroyableResource {
  destroy(): void;
}

interface ResourceEntry {
  readonly label: string;
  readonly resource: DestroyableResource;
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
      }
    }
    this.#entries.length = 0;
  }
}
