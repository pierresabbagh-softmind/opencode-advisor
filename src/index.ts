import { Plugin } from "@opencode/plugin";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_ADVISOR_CONFIG,
  parseAdvisorConfig,
  type AdvisorConfig,
} from "./config";
import { AdvisorRpc } from "./rpc";
import { parseModelID } from "./model_id";
import { RateLimiter } from "./rate_limiter";
import { buildAdvisorPrompt } from "./prompt";
import { truncate } from "./transcript";

type OptionsSource = "options" | "side-file" | "defaults";

type AdvisorOptions = AdvisorConfig & {
  disabled: boolean;
  injectReminder: boolean;
};

type AssistantContentItem = {
  type: string;
  text?: string;
  name?: string;
  state?: {
    status?: string;
    input?: Record<string, unknown>;
    content?: Array<{ type: string; text?: string }>;
    error?: unknown;
  };
};

type ContextMessage = {
  type?: string;
  text?: string;
  content?: AssistantContentItem[];
};

type AdvisorStats = { total: number; lastSessionID?: string; lastSessionCount?: number };

const TOOL_INPUT_CAP = 300;
const TOOL_RESULT_CAP = 500;

const TOOL_DESCRIPTION = [
  "Consult a senior advisor model for strategic guidance. Use sparingly, only at key moments:",
  "before committing to a non-obvious approach, when an error keeps recurring, when unsure,",
  "or before declaring a task complete. The advisor sees the current transcript (including tool",
  "calls and their results) plus your question. Treat its guidance as input, not orders:",
  "if it conflicts with your own evidence, surface the conflict to the user rather than",
  "following it blindly.",
].join(" ");

const REMINDER_TEXT =
  "You have an ask_advisor tool: consult it before committing to a non-obvious approach, " +
  "when an error keeps recurring, and before declaring a task complete. Treat advice as input; " +
  "if it conflicts with your own evidence, surface the conflict.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sideFilePaths(directory: string): string[] {
  return [
    join(directory, ".opencode", "oc-advisor.json"),
    join(homedir(), ".config", "opencode", "oc-advisor.json"),
  ];
}

function readRawSideFile(directory: string): { raw: Record<string, unknown>; path: string } | undefined {
  for (const path of sideFilePaths(directory)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf-8"));
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") console.warn(`oc-advisor: cannot read ${path}: ${formatError(e)}`);
      continue; // try next candidate
    }
    if (isRecord(parsed)) return { raw: parsed, path };
    console.warn(`oc-advisor: ${path} root is not an object, ignoring`);
  }
  return undefined;
}

function withLocalFlags(config: AdvisorConfig, raw: Record<string, unknown> | undefined): AdvisorOptions {
  return {
    ...config,
    disabled: raw?.disabled === true,
    injectReminder: raw?.injectReminder === true,
  };
}

function resolveOptions(
  ctxOptions: unknown,
  directory: string,
): { options: AdvisorOptions; source: OptionsSource; sideFilePath?: string } {
  if (isRecord(ctxOptions) && Object.keys(ctxOptions).length > 0) {
    try {
      return { options: withLocalFlags(parseAdvisorConfig(ctxOptions), ctxOptions), source: "options" };
    } catch (e) {
      console.warn(`oc-advisor: invalid plugin options (${String(e)}); falling back to defaults`);
      return { options: withLocalFlags(DEFAULT_ADVISOR_CONFIG, undefined), source: "defaults" };
    }
  }
  const found = readRawSideFile(directory);
  if (found) {
    try {
      return { options: withLocalFlags(parseAdvisorConfig(found.raw), found.raw), source: "side-file", sideFilePath: found.path };
    } catch (e) {
      console.warn(`oc-advisor: malformed oc-advisor.json (${String(e)}); using defaults`);
      return { options: withLocalFlags(DEFAULT_ADVISOR_CONFIG, found.raw), source: "defaults", sideFilePath: found.path };
    }
  }
  return { options: withLocalFlags(DEFAULT_ADVISOR_CONFIG, undefined), source: "defaults" };
}

function formatError(value: unknown): string {
  return truncate(typeof value === "string" ? value : JSON.stringify(value) ?? String(value), 500);
}

function extractTranscriptV2(messages: ReadonlyArray<ContextMessage>): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.type === "user" && typeof m.text === "string" && m.text.trim().length > 0) {
      lines.push(`[user] ${m.text.trim()}`);
      continue;
    }
    if (m.type !== "assistant" || !Array.isArray(m.content)) continue;
    for (const part of m.content) {
      if (part.type === "text" && typeof part.text === "string" && part.text.trim().length > 0) {
        lines.push(`[assistant] ${part.text.trim()}`);
        continue;
      }
      if (part.type === "tool" && typeof part.name === "string") {
        const input = part.state?.input ? truncate(JSON.stringify(part.state.input), TOOL_INPUT_CAP) : "";
        lines.push(`[tool] ${part.name}(${input})`);
        const resultText = (part.state?.content ?? [])
          .filter((c) => c.type === "text" && typeof c.text === "string")
          .map((c) => c.text as string)
          .join(" ")
          .trim();
        if (resultText.length > 0) {
          lines.push(`[tool-result] ${truncate(resultText, TOOL_RESULT_CAP)}`);
        }
        if (part.state?.error !== undefined && part.state?.error !== null) {
          lines.push(`[tool-error] ${part.name}: ${formatError(part.state.error)}`);
        }
      }
    }
  }
  return lines.join("\n");
}

function normalizeMessages(raw: unknown): ContextMessage[] {
  if (Array.isArray(raw)) return raw as unknown as ContextMessage[];
  if (isRecord(raw) && Array.isArray(raw.messages)) return raw.messages as unknown as ContextMessage[];
  return [];
}

function extractAssistantReply(messages: ReadonlyArray<ContextMessage>): { text: string; thinking: string } {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type !== "assistant" || !Array.isArray(m.content)) continue;
    const text = m.content
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("\n")
      .trim();
    const thinking = m.content
      .filter((p) => p.type === "reasoning" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("\n")
      .trim();
    if (text.length > 0 || thinking.length > 0) return { text, thinking };
  }
  return { text: "", thinking: "" };
}

async function setup(ctx: Plugin.Context): Promise<void> {
  const { location } = ctx;
  const resolved = resolveOptions(ctx.options, location.directory);
  let { options, source } = resolved;
  const sideFilePath = resolved.sideFilePath;
  let limiter = new RateLimiter(options.maxCallsPerSession);
  let stats: AdvisorStats = { total: 0 };
  try {
    const stored: unknown = await ctx.storage.get("stats");
    // tolerate both {total} and {key,value:{total}}-style envelopes
    const candidate = isRecord(stored) && isRecord(stored.value) ? stored.value : stored;
    if (isRecord(candidate) && typeof candidate.total === "number") {
      stats = {
        total: candidate.total as number,
        lastSessionID: typeof candidate.lastSessionID === "string" ? candidate.lastSessionID : undefined,
        lastSessionCount: typeof candidate.lastSessionCount === "number" ? (candidate.lastSessionCount as number) : undefined,
      };
    }
  } catch {
    // storage unavailable: start fresh counters
  }

  let validatedModels = options.advisorModels ?? [];
  try {
    const models = (await ctx.model.list()).data;
    const valid = validatedModels.filter((m) => {
      try {
        const parsed = parseModelID(m);
        const found = models.some(
          (info) => info.providerID === parsed.providerID && (info.modelID === parsed.modelID || info.id === parsed.modelID),
        );
        if (!found) console.warn(`oc-advisor: advisor model not available, dropping: ${m}`);
        return found;
      } catch {
        return false;
      }
    });
    if (valid.length < validatedModels.length) {
      console.warn(
        valid.length > 0
          ? `oc-advisor: using available advisor models: ${valid.join(", ")}`
          : "oc-advisor: no configured advisor model is available",
      );
    }
    validatedModels = valid;
  } catch {
    // model list unavailable (providers not connected): keep configured models
  }

  const advisorChildIDs = new Set<string>();

  const persistOptions = async (patch: Record<string, unknown>): Promise<void> => {
    if (source === "options") {
      console.warn("oc-advisor: options come from the plugin entry in opencode.jsonc; edit them there");
      return;
    }
    const targetPath = sideFilePath ?? join(homedir(), ".config", "opencode", "oc-advisor.json");
    let current: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(readFileSync(targetPath, "utf-8"));
      if (isRecord(parsed)) current = parsed;
    } catch {
      // no existing file
    }
    const next = { ...current, ...patch };
    writeFileSync(targetPath, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  };

  const setOptions = (patch: Partial<AdvisorOptions>): void => {
    options = { ...options, ...patch };
    if (patch.maxCallsPerSession !== undefined) {
      limiter = new RateLimiter(patch.maxCallsPerSession);
    }
  };

  const applyAdvisorModel = async (model: string): Promise<{ available: boolean }> => {
    parseModelID(model);
    validatedModels = [model, ...validatedModels.filter((m) => m !== model)];
    const primary: AdvisorConfig["advisorModel"] =
      validatedModels.length === 1 ? validatedModels[0] : [...validatedModels];
    setOptions({ advisorModels: [...validatedModels], advisorModel: primary, disabled: false });
    await persistOptions({ advisorModels: [...validatedModels], advisorModel: primary, disabled: false });
    try {
      const models = (await ctx.model.list()).data;
      const parsed = parseModelID(model);
      return {
        available: models.some(
          (info) => info.providerID === parsed.providerID && (info.modelID === parsed.modelID || info.id === parsed.modelID),
        ),
      };
    } catch {
      return { available: true };
    }
  };

  const saveStats = async (sessionID: string): Promise<void> => {
    stats.lastSessionID = sessionID;
    stats.lastSessionCount = limiter.used(sessionID);
    try {
      await ctx.storage.set("stats", stats);
    } catch {
      // storage best-effort only
    }
  };

  await ctx.tool.transform((editor) => {
    editor.add({
      name: "ask_advisor",
      description: TOOL_DESCRIPTION,
      input: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The specific question or decision you want advice on. Be concrete.",
          },
          context: {
            type: "string",
            description: "Optional extra context: file paths, code snippets, prior decisions, or constraints.",
          },
        },
        required: ["question"],
        additionalProperties: false,
      },
      execute: async (rawArgs, tctx) => {
        const input = rawArgs as { question?: unknown; context?: unknown };
        if (options.disabled) {
          return { content: "Advisor is disabled. Re-enable with /advisor on or edit oc-advisor.json (disabled: false)." };
        }
        if (typeof input.question !== "string" || input.question.trim().length === 0) {
          return { content: "Error: a non-empty `question` argument is required." };
        }
        const question = input.question;
        const context = typeof input.context === "string" ? input.context : undefined;
        if (validatedModels.length === 0) {
          return {
            content: `No valid advisor model. Configured: [${(options.advisorModels ?? []).join(", ")}]. Connect the provider or pick another with /advisor <model>.`,
          };
        }
        const acquired = limiter.tryAcquire(tctx.sessionID);
        if (!acquired.allowed) {
          return {
            content: `Advisor call limit (${options.maxCallsPerSession}) reached for this session. Raise "maxCallsPerSession" in .opencode/oc-advisor.json, or start a new session.`,
          };
        }

        let messages: ContextMessage[];
        try {
          messages = normalizeMessages(await ctx.session.context({ sessionID: tctx.sessionID }));
        } catch (e) {
          limiter.refund(tctx.sessionID);
          return { content: `Failed to read session transcript: ${formatError(e)}` };
        }

        const transcript = truncate(extractTranscriptV2(messages), options.transcriptCharBudget);
        const { system, user } = buildAdvisorPrompt({ transcript, question, context });

        try {
          await tctx.progress({ status: `advising via ${validatedModels.join(", ")}…` });
        } catch {
          // progress is best-effort
        }

        let lastError: unknown = null;
        try {
          for (const modelStr of validatedModels) {
            let childID: string | undefined;
            try {
              const parsed = parseModelID(modelStr);
              const created = await ctx.session.create({
                parentID: tctx.sessionID,
                title: "advisor",
                model: { providerID: parsed.providerID, id: parsed.modelID },
              });
              childID = created.id;
              advisorChildIDs.add(childID);
              await ctx.session.prompt({ sessionID: childID, text: `${system}\n\n${user}` });
              await ctx.session.wait({ sessionID: childID });
              const after = normalizeMessages(await ctx.session.context({ sessionID: childID }));
              const { text, thinking } = extractAssistantReply(after);
              if (text.length === 0) {
                limiter.refund(tctx.sessionID);
                return { content: "(advisor returned no text response)" };
              }
              limiter.commit(tctx.sessionID);
              stats.total += 1;
              await saveStats(tctx.sessionID);
              const body =
                options.showAdvisorThinking !== false && thinking.length > 0
                  ? `${text}\n\n---\n**Advisor thinking:**\n${thinking}`
                  : text;
              return { content: `Advisor Response (${modelStr})\n\n${body}` };
            } catch (e) {
              lastError = e;
            } finally {
              if (childID) {
                advisorChildIDs.delete(childID);
                await ctx.session.remove({ sessionID: childID }).catch(() => undefined);
              }
            }
          }
          limiter.refund(tctx.sessionID);
          return {
            content: `All advisor models failed [${validatedModels.join(", ")}]. Last error: ${formatError(lastError)}`,
          };
        } catch (e) {
          limiter.refund(tctx.sessionID);
          return { content: `Advisor error: ${formatError(e)}` };
        }
      },
    });
  });

  await ctx.rpc.register(AdvisorRpc, {
    status: async () => ({
      models: [...validatedModels],
      disabled: options.disabled,
      source,
      maxCallsPerSession: options.maxCallsPerSession,
      transcriptCharBudget: options.transcriptCharBudget,
      totalCalls: stats.total,
    }),
    set: async (input, context) => {
      const model = (input as { model?: unknown }).model;
      if (typeof model !== "string" || model.length === 0) {
        return context.error("invalid_model", `Invalid model id: ${String(model)}`, { model: String(model) });
      }
      try {
        const { available } = await applyAdvisorModel(model);
        return { model, available };
      } catch {
        return context.error("invalid_model", `Invalid model id: "${model}". Expected provider/model.`, { model });
      }
    },
    setDisabled: async (input) => {
      const disabled = (input as { disabled?: unknown }).disabled === true;
      setOptions({ disabled });
      await persistOptions({ disabled });
      return { disabled, source };
    },
  });

  await ctx.session.hook("context", (event) => {
    const e = event as unknown as {
      sessionID?: string;
      system?: Array<{ type: string; text: string }>;
      tools?: Record<string, unknown>;
    };
    if (e.sessionID !== undefined && advisorChildIDs.has(e.sessionID)) {
      if (e.tools) delete e.tools.ask_advisor;
      return;
    }
    if (!options.injectReminder) return;
    e.system ??= [];
    e.system.push({ type: "text", text: REMINDER_TEXT });
  });
}

export default Plugin.define({ id: "oc-advisor", setup });
