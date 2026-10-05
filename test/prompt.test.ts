import { describe, expect, test } from "bun:test";
import { ADVISOR_SYSTEM_PROMPT, buildAdvisorPrompt } from "../src/prompt";

describe("buildAdvisorPrompt", () => {
  test("should return fixed system prompt declaring advisor role", () => {
    const { system } = buildAdvisorPrompt({ transcript: "t", question: "q" });
    expect(system).toBe(ADVISOR_SYSTEM_PROMPT);
    expect(system).toContain("advisor");
  });

  test("should include transcript section in user prompt", () => {
    const { user } = buildAdvisorPrompt({ transcript: "TLINE", question: "q" });
    expect(user).toContain("## Current Session Transcript\nTLINE");
  });

  test("should include question section in user prompt", () => {
    const { user } = buildAdvisorPrompt({ transcript: "t", question: "Do we split services?" });
    expect(user).toContain("## Question\nDo we split services?");
  });

  test("should include context section only when context is provided", () => {
    const withContext = buildAdvisorPrompt({
      transcript: "t",
      question: "q",
      context: "extra hint",
    });
    expect(withContext.user).toContain("## Additional Context\nextra hint");

    const withoutContext = buildAdvisorPrompt({ transcript: "t", question: "q" });
    expect(withoutContext.user).not.toContain("## Additional Context");
  });

  test("should join sections with double newline", () => {
    const { user } = buildAdvisorPrompt({
      transcript: "TLINE",
      question: "Q?",
      context: "C",
    });
    const sections = user.split("\n\n");
    expect(sections.length).toBe(3);
    expect(sections[0].startsWith("## Current Session Transcript")).toBe(true);
    expect(sections[1].startsWith("## Question")).toBe(true);
    expect(sections[2].startsWith("## Additional Context")).toBe(true);
  });
});