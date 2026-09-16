/** The listeners of one event, added one at a time and told together. */
export class Listeners<T> {
  private readonly set = new Set<(value: T) => void>();

  /** Hear each value; returns the unsubscribe. */
  add(listener: (value: T) => void): () => void {
    this.set.add(listener);
    return () => {
      this.set.delete(listener);
    };
  }

  /** Tell every listener `value`, in the order they were added. */
  emit(value: T): void {
    for (const listener of this.set) {
      listener(value);
    }
  }

  /** Forget every listener. */
  clear(): void {
    this.set.clear();
  }
}
