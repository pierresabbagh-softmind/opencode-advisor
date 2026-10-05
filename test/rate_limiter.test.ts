import { describe, expect, test } from "bun:test";
import { RateLimiter } from "../src/rate_limiter";

describe("RateLimiter", () => {
  test("should allow acquisition within cap", () => {
    const limiter = new RateLimiter(3);
    expect(limiter.tryAcquire("s1")).toEqual({ allowed: true, remaining: 2 });
    expect(limiter.tryAcquire("s1")).toEqual({ allowed: true, remaining: 1 });
    expect(limiter.tryAcquire("s1")).toEqual({ allowed: true, remaining: 0 });
  });

  test("should deny acquisition after cap is exceeded", () => {
    const limiter = new RateLimiter(2);
    limiter.tryAcquire("s1");
    limiter.tryAcquire("s1");
    expect(limiter.tryAcquire("s1")).toEqual({ allowed: false, remaining: 0 });
  });

  test("should track sessions independently", () => {
    const limiter = new RateLimiter(1);
    limiter.tryAcquire("s1");
    expect(limiter.tryAcquire("s2")).toEqual({ allowed: true, remaining: 0 });
  });

  test("should report total used count for a session", () => {
    const limiter = new RateLimiter(10);
    limiter.tryAcquire("s1");
    limiter.tryAcquire("s1");
    limiter.tryAcquire("s1");
    expect(limiter.used("s1")).toBe(3);
  });

  test("should reset a session counter", () => {
    const limiter = new RateLimiter(10);
    limiter.tryAcquire("s1");
    limiter.tryAcquire("s1");
    limiter.reset("s1");
    expect(limiter.used("s1")).toBe(0);
  });

  test("should not increment used beyond cap when denied", () => {
    const limiter = new RateLimiter(2);
    limiter.tryAcquire("s1");
    limiter.tryAcquire("s1");
    limiter.tryAcquire("s1");
    limiter.tryAcquire("s1");
    expect(limiter.used("s1")).toBe(2);
  });

  test("should report zero used for unknown session", () => {
    const limiter = new RateLimiter(5);
    expect(limiter.used("unknown")).toBe(0);
  });

  test("should refund an acquired slot on failure and reclaim capacity", () => {
    const limiter = new RateLimiter(1);
    limiter.tryAcquire("s1");
    limiter.refund("s1");
    expect(limiter.used("s1")).toBe(0);
    expect(limiter.tryAcquire("s1")).toEqual({ allowed: true, remaining: 0 });
  });

  test("should refund decrement count toward zero without going negative", () => {
    const limiter = new RateLimiter(3);
    limiter.tryAcquire("s1");
    limiter.tryAcquire("s1");
    limiter.refund("s1");
    expect(limiter.used("s1")).toBe(1);
    limiter.refund("s1");
    expect(limiter.used("s1")).toBe(0);
    limiter.refund("s1");
    expect(limiter.used("s1")).toBe(0);
  });

  test("should not refund a committed reservation", () => {
    const limiter = new RateLimiter(1);
    limiter.tryAcquire("s1");
    limiter.commit("s1");
    limiter.refund("s1");
    expect(limiter.used("s1")).toBe(1);
  });

  test("should not refund when no reservation exists", () => {
    const limiter = new RateLimiter(2);
    expect(() => limiter.refund("never")).not.toThrow();
    expect(limiter.used("never")).toBe(0);
  });

  test("should not double refund the same reservation", () => {
    const limiter = new RateLimiter(1);
    limiter.tryAcquire("s1");
    limiter.refund("s1");
    expect(limiter.used("s1")).toBe(0);
    limiter.refund("s1");
    expect(limiter.used("s1")).toBe(0);
  });
});