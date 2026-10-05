import { describe, expect, test } from "bun:test";
import {
  extractTranscript,
  extractTranscriptThenTruncate,
  truncate,
} from "../src/transcript";

describe("extractTranscript", () => {
  test("should extract text parts from a message and join with role prefix", () => {
    const messages = [
      {
        info: { role: "user" as const },
        parts: [
          { type: "text" as const, text: "Hello" },
          { type: "tool" as const, id: "x", name: "n", input: {} },
        ],
      },
    ];
    expect(extractTranscript(messages)).toBe("[user] Hello");
  });

  test("should join multiple messages with newline", () => {
    const messages = [
      { info: { role: "user" as const }, parts: [{ type: "text" as const, text: "Hi" }] },
      { info: { role: "assistant" as const }, parts: [{ type: "text" as const, text: "Hello" }] },
    ];
    expect(extractTranscript(messages)).toBe("[user] Hi\n[assistant] Hello");
  });

  test("should handle empty messages array producing empty transcript", () => {
    expect(extractTranscript([])).toBe("");
  });

  test("should skip messages with no text parts", () => {
    const messages = [
      { info: { role: "user" as const }, parts: [{ type: "tool" as const, id: "x", name: "n", input: {} }] },
    ];
    expect(extractTranscript(messages)).toBe("");
  });
});

describe("truncate", () => {
  test("should keep most recent content within char budget and drop oldest", () => {
    const text = "[user]aaa[assistant]bbb[user]ccc";
    expect(truncate(text, 10)).toBe(text.slice(text.length - 10));
  });

  test("should return full text when within budget", () => {
    expect(truncate("abcde", 100)).toBe("abcde");
  });

  test("should return empty string when budget is 0", () => {
    expect(truncate("abc", 0)).toBe("");
  });

  test("should return empty string when budget is negative", () => {
    expect(truncate("abc", -5)).toBe("");
  });

  test("should return empty string for empty text", () => {
    expect(truncate("", 10)).toBe("");
  });
});

describe("extractTranscriptThenTruncate", () => {
  test("should extract then truncate in one call", () => {
    const messages = [
      { info: { role: "user" as const }, parts: [{ type: "text" as const, text: "AAAAAAAAAA" }] },
      { info: { role: "assistant" as const }, parts: [{ type: "text" as const, text: "BBBBBBBBBB" }] },
      { info: { role: "user" as const }, parts: [{ type: "text" as const, text: "CCCCCCCCCC" }] },
    ];
    const transcript = extractTranscript(messages);
    const expected = truncate(transcript, 15);
    expect(extractTranscriptThenTruncate(messages, 15)).toBe(expected);
  });

  test("should return empty string for empty messages with a budget", () => {
    expect(extractTranscriptThenTruncate([], 100)).toBe("");
  });
});