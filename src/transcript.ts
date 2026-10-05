export type TranscriptMessage = {
  readonly info: {
    readonly role: "user" | "assistant" | "system" | string;
  };
  readonly parts: ReadonlyArray<TranscriptPart>;
};

export type TranscriptPart = TextPart | NonTextPart;

export type TextPart = {
  readonly type: "text";
  readonly text: string;
};

export type NonTextPart = {
  readonly type: string;
  readonly [key: string]: unknown;
};

export function extractTranscript(messages: ReadonlyArray<TranscriptMessage>): string {
  return messages
    .map((m) => {
      const texts = m.parts
        .filter((p): p is TextPart => p.type === "text")
        .map((p) => p.text)
        .join(" ");
      return texts.length === 0 ? "" : `[${m.info.role}] ${texts}`;
    })
    .filter((line) => line.length > 0)
    .join("\n");
}

export function truncate(text: string, budget: number): string {
  if (budget <= 0) return "";
  if (text.length <= budget) return text;
  return text.slice(text.length - budget);
}

export function extractTranscriptThenTruncate(
  messages: ReadonlyArray<TranscriptMessage>,
  budget: number,
): string {
  return truncate(extractTranscript(messages), budget);
}