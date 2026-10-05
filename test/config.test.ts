import { describe, expect, test } from "bun:test";
import { InvalidModelError } from "../src/model_id";
import { DEFAULT_ADVISOR_CONFIG, parseAdvisorConfig, parseAdvisorConfigJSON } from "../src/config";

describe("parseAdvisorConfig", () => {
  test("should return default config when options is undefined", () => {
    expect(parseAdvisorConfig(undefined)).toEqual(DEFAULT_ADVISOR_CONFIG);
    expect(parseAdvisorConfig(undefined)).toEqual({
      advisorModel: "opencode-go/kimi-k2.7-code",
      advisorModels: ["opencode-go/kimi-k2.7-code"],
      maxCallsPerSession: 20,
      transcriptCharBudget: 20000,
      showAdvisorThinking: true,
    });
  });

  test("should override advisorModel when provided", () => {
    const cfg = parseAdvisorConfig({ advisorModel: "anthropic/claude-opus-4-20250514" });
    expect(cfg.advisorModel).toBe("anthropic/claude-opus-4-20250514");
    expect(cfg.maxCallsPerSession).toBe(20);
    expect(cfg.transcriptCharBudget).toBe(20000);
  });

  test("should override maxCallsPerSession with positive number", () => {
    expect(parseAdvisorConfig({ maxCallsPerSession: 5 }).maxCallsPerSession).toBe(5);
  });

  test("should ignore non-positive maxCallsPerSession and fall back to default", () => {
    expect(parseAdvisorConfig({ maxCallsPerSession: 0 }).maxCallsPerSession).toBe(20);
    expect(parseAdvisorConfig({ maxCallsPerSession: -3 }).maxCallsPerSession).toBe(20);
  });

  test("should override transcriptCharBudget with positive number", () => {
    expect(parseAdvisorConfig({ transcriptCharBudget: 5000 }).transcriptCharBudget).toBe(5000);
  });

  test("should ignore non-positive transcriptCharBudget and fall back to default", () => {
    expect(parseAdvisorConfig({ transcriptCharBudget: 0 }).transcriptCharBudget).toBe(20000);
  });

  test("should validate advisorModel format and throw when invalid", () => {
    expect(() => parseAdvisorConfig({ advisorModel: "no-slash-string" })).toThrow(InvalidModelError);
  });

  test("should ignore unknown keys in options", () => {
    const cfg = parseAdvisorConfig({ foo: "bar", advisorModel: "opencode-go/glm-5.2" });
    expect(cfg).toEqual({
      advisorModel: "opencode-go/glm-5.2",
      advisorModels: ["opencode-go/glm-5.2"],
      maxCallsPerSession: 20,
      transcriptCharBudget: 20000,
      showAdvisorThinking: true,
    });
  });

  test("should ignore non-object options and return default", () => {
    expect(parseAdvisorConfig("foo" as unknown)).toEqual(DEFAULT_ADVISOR_CONFIG);
    expect(parseAdvisorConfig(null as unknown)).toEqual(DEFAULT_ADVISOR_CONFIG);
  });

  test("should ignore wrong-typed advisorModel and fall back to default", () => {
    const cfg = parseAdvisorConfig({ advisorModel: 123 as unknown });
    expect(cfg.advisorModel).toBe("opencode-go/kimi-k2.7-code");
  });

  test("should ignore wrong-typed numeric options and fall back to default", () => {
    const cfg = parseAdvisorConfig({
      maxCallsPerSession: "20" as unknown,
      transcriptCharBudget: "5000" as unknown,
    });
    expect(cfg.maxCallsPerSession).toBe(20);
    expect(cfg.transcriptCharBudget).toBe(20000);
  });

  test("should default showAdvisorThinking to true", () => {
    expect(parseAdvisorConfig({}).showAdvisorThinking).toBe(true);
  });

  test("should respect explicit showAdvisorThinking false", () => {
    expect(parseAdvisorConfig({ showAdvisorThinking: false }).showAdvisorThinking).toBe(false);
  });

  test("should ignore wrong-typed showAdvisorThinking and fall back to default", () => {
    expect(parseAdvisorConfig({ showAdvisorThinking: "yes" as unknown }).showAdvisorThinking).toBe(true);
  });
});

describe("parseAdvisorConfigJSON", () => {
  test("should parse a valid JSON object and override advisorModel", () => {
    const text = JSON.stringify({ advisorModel: "anthropic/claude-opus-4-20250514" });
    const cfg = parseAdvisorConfigJSON(text);
    expect(cfg.advisorModel).toBe("anthropic/claude-opus-4-20250514");
    expect(cfg.maxCallsPerSession).toBe(20);
  });

  test("should return default config on malformed JSON", () => {
    expect(parseAdvisorConfigJSON("{not json")).toEqual(DEFAULT_ADVISOR_CONFIG);
  });

  test("should return default config on empty string", () => {
    expect(parseAdvisorConfigJSON("")).toEqual(DEFAULT_ADVISOR_CONFIG);
  });

  test("should return default config on JSON that is not an object", () => {
    expect(parseAdvisorConfigJSON("123")).toEqual(DEFAULT_ADVISOR_CONFIG);
    expect(parseAdvisorConfigJSON("null")).toEqual(DEFAULT_ADVISOR_CONFIG);
    expect(parseAdvisorConfigJSON("[]")).toEqual(DEFAULT_ADVISOR_CONFIG);
  });
});