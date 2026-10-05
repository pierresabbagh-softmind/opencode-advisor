export const ADVISOR_SYSTEM_PROMPT =
  "You are a senior strategic advisor to a coding agent. " +
  "Your job is to read the current conversation transcript and the executor's question, " +
  "then produce a concise, actionable strategic plan or course correction. " +
  "Focus on the highest-leverage decision: architecture, risks, hidden failure modes, and a recommended next step. " +
  "Be direct and honest about uncertainty. Do not repeat the transcript. " +
  "Do not write code unless a tiny snippet is the clearest way to convey the advice. " +
  "Keep it short: a few paragraphs at most.";

export type AdvisorPromptInput = {
  readonly transcript: string;
  readonly question: string;
  readonly context?: string;
};

export type AdvisorPromptOutput = {
  readonly system: string;
  readonly user: string;
};

export function buildAdvisorPrompt(input: AdvisorPromptInput): AdvisorPromptOutput {
  const sections = [
    `## Current Session Transcript\n${input.transcript}`,
    `## Question\n${input.question}`,
    input.context ? `## Additional Context\n${input.context}` : "",
  ];
  return {
    system: ADVISOR_SYSTEM_PROMPT,
    user: sections.filter((s) => s.length > 0).join("\n\n"),
  };
}