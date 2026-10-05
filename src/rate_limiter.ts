export type AcquireResult = {
  readonly allowed: boolean;
  readonly remaining: number;
};

export class RateLimiter {
  private readonly max: number;
  private readonly counts: Map<string, number>;
  private readonly reserved: Map<string, number>;

  constructor(max: number) {
    this.max = max;
    this.counts = new Map();
    this.reserved = new Map();
  }

  tryAcquire(key: string): AcquireResult {
    const current = this.counts.get(key) ?? 0;
    if (current >= this.max) {
      return { allowed: false, remaining: 0 };
    }
    const next = current + 1;
    this.counts.set(key, next);
    this.reserved.set(key, (this.reserved.get(key) ?? 0) + 1);
    return { allowed: true, remaining: this.max - next };
  }

  commit(key: string): void {
    const r = this.reserved.get(key) ?? 0;
    if (r <= 1) {
      this.reserved.delete(key);
    } else {
      this.reserved.set(key, r - 1);
    }
  }

  refund(key: string): void {
    const r = this.reserved.get(key) ?? 0;
    if (r === 0) {
      return;
    }
    if (r <= 1) {
      this.reserved.delete(key);
    } else {
      this.reserved.set(key, r - 1);
    }
    const current = this.counts.get(key) ?? 0;
    if (current <= 1) {
      this.counts.delete(key);
    } else {
      this.counts.set(key, current - 1);
    }
  }

  used(key: string): number {
    return this.counts.get(key) ?? 0;
  }

  reset(key: string): void {
    this.counts.delete(key);
    this.reserved.delete(key);
  }
}