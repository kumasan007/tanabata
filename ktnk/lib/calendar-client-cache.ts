// Bounded, per-calendar cache. Refreshes and writes clear it explicitly.
export class CalendarClientCache<T> {
  private entries = new Map<string, { value: T; expires: number }>();

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T) {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: Date.now() + 30_000 });
    if (this.entries.size > 32) this.entries.delete(this.entries.keys().next().value!);
  }

  clear() { this.entries.clear(); }
}
