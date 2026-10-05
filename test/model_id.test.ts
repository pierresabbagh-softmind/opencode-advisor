import { describe, expect, test } from "bun:test";
import { InvalidModelError, parseModelID } from "../src/model_id";

describe("parseModelID", () => {
  test("should parse provider/model into providerID and modelID when modelID has no slash", () => {
    expect(parseModelID("opencode-go/kimi-k2.7-code")).toEqual({
      providerID: "opencode-go",
      modelID: "kimi-k2.7-code",
    });
  });

  test("should split on first slash only so local providers with nested model ids parse correctly", () => {
    expect(parseModelID("lmstudio/google/gemma-3n-e4b")).toEqual({
      providerID: "lmstudio",
      modelID: "google/gemma-3n-e4b",
    });
  });

  test("should throw InvalidModelError when input has no slash", () => {
    expect(() => parseModelID("invalid")).toThrow(InvalidModelError);
  });

  test("should throw InvalidModelError when provider or model part is empty", () => {
    expect(() => parseModelID("/x")).toThrow(InvalidModelError);
    expect(() => parseModelID("x/")).toThrow(InvalidModelError);
    expect(() => parseModelID("")).toThrow(InvalidModelError);
  });

  test("should format InvalidModelError message as Invalid model id: <raw>", () => {
    expect(() => parseModelID("invalid")).toThrow("Invalid model id: invalid");
    expect(() => parseModelID("/x")).toThrow("Invalid model id: /x");
    expect(() => parseModelID("x/")).toThrow("Invalid model id: x/");
    expect(() => parseModelID("")).toThrow("Invalid model id: ");
  });
});
