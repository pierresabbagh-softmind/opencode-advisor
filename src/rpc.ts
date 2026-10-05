import { Rpc } from "@opencode/plugin/rpc";

export const AdvisorRpc = Rpc.define({
  id: "oc-advisor",
  methods: {
    status: {
      input: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          models: { type: "array", items: { type: "string" } },
          disabled: { type: "boolean" },
          source: { type: "string" },
          maxCallsPerSession: { type: "number" },
          transcriptCharBudget: { type: "number" },
          totalCalls: { type: "number" },
        },
        required: ["models", "disabled", "source", "maxCallsPerSession", "transcriptCharBudget", "totalCalls"],
        additionalProperties: false,
      },
    },
    set: {
      input: {
        type: "object",
        properties: { model: { type: "string" } },
        required: ["model"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          model: { type: "string" },
          available: { type: "boolean" },
        },
        required: ["model", "available"],
        additionalProperties: false,
      },
      errors: {
        invalid_model: {
          type: "object",
          properties: { model: { type: "string" } },
          required: ["model"],
          additionalProperties: false,
        },
      },
    },
    setDisabled: {
      input: {
        type: "object",
        properties: { disabled: { type: "boolean" } },
        required: ["disabled"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          disabled: { type: "boolean" },
          source: { type: "string" },
        },
        required: ["disabled", "source"],
        additionalProperties: false,
      },
    },
  },
  events: {},
});
