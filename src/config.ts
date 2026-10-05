import { parseModelID } from "./model_id";

export type AdvisorConfig = {
  readonly advisorModel: string | readonly string[];
  readonly advisorModels?: readonly string[];
  readonly maxCallsPerSession: number;
  readonly transcriptCharBudget: number;
  readonly showAdvisorThinking: boolean;
};

export const DEFAULT_ADVISOR_CONFIG: AdvisorConfig = {
  advisorModel: "opencode-go/kimi-k2.7-code",
  advisorModels: ["opencode-go/kimi-k2.7-code"],
  maxCallsPerSession: 20,
  transcriptCharBudget: 20000,
  showAdvisorThinking: true,
};

type RawOptions = {
  readonly advisorModel?: unknown;
  readonly advisorModels?: unknown;
  readonly maxCallsPerSession?: unknown;
  readonly transcriptCharBudget?: unknown;
  readonly showAdvisorThinking?: unknown;
  readonly [key: string]: unknown;
};

function isPlainObject(value: unknown): value is RawOptions {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function pickAdvisorModels(opts: RawOptions, fallback: string): readonly string[] {
  // Preferred: advisorModels as string[]
  if (Array.isArray(opts.advisorModels) && opts.advisorModels.length > 0) {
    const models = opts.advisorModels.filter((m): m is string => typeof m === "string" && m.length > 0);
    if (models.length > 0) {
      models.forEach(parseModelID);
      return models;
    }
  }
  // Also support advisorModel as string[] (array form)
  if (Array.isArray(opts.advisorModel) && opts.advisorModel.length > 0) {
    const models = opts.advisorModel.filter((m): m is string => typeof m === "string" && m.length > 0);
    if (models.length > 0) {
      models.forEach(parseModelID);
      return models;
    }
  }
  // Legacy: single string
  if (typeof opts.advisorModel === "string" && opts.advisorModel.length > 0) {
    parseModelID(opts.advisorModel);
    return [opts.advisorModel];
  }
  parseModelID(fallback);
  return [fallback];
}

function pickPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function parseAdvisorConfig(opts?: unknown): AdvisorConfig {
  if (!isPlainObject(opts)) {
    return DEFAULT_ADVISOR_CONFIG;
  }

  const advisorModels = pickAdvisorModels(opts, DEFAULT_ADVISOR_CONFIG.advisorModel as string);
  const advisorModel = advisorModels.length === 1 ? advisorModels[0] : advisorModels;

  return {
    advisorModel,
    advisorModels,
    maxCallsPerSession: pickPositiveNumber(opts.maxCallsPerSession, DEFAULT_ADVISOR_CONFIG.maxCallsPerSession),
    transcriptCharBudget: pickPositiveNumber(opts.transcriptCharBudget, DEFAULT_ADVISOR_CONFIG.transcriptCharBudget),
    showAdvisorThinking: pickBoolean(opts.showAdvisorThinking, DEFAULT_ADVISOR_CONFIG.showAdvisorThinking),
  };
}

export function parseAdvisorConfigJSON(text: string): AdvisorConfig {
  try {
    const parsed: unknown = JSON.parse(text);
    return parseAdvisorConfig(parsed);
  } catch {
    return DEFAULT_ADVISOR_CONFIG;
  }
}