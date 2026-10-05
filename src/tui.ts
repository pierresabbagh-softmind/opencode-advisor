import { Plugin } from "@opencode/plugin/tui";
import { AdvisorRpc } from "./rpc";

type AdvisorStatus = {
  models: string[];
  disabled: boolean;
  source: string;
  maxCallsPerSession: number;
  transcriptCharBudget: number;
  totalCalls: number;
};

export default Plugin.define({
  id: "oc-advisor.pick",
  setup(context) {
    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "oc-advisor.pick",
          title: "Advisor",
          description: "Pick the advisor model, toggle it, or show status",
          group: "Advisor",
          palette: true,
          slash: { name: "advisor", arguments: true },
          run: async (input) => {
            const args = (input ?? "").trim();
            const location = context.location ?? context.data.location.default();
            const advisor = context.client.rpc(AdvisorRpc);
            const rpcLocation = { location: { directory: location.directory } };
            let status: AdvisorStatus;
            try {
              status = (await advisor.status({}, rpcLocation)) as AdvisorStatus;
            } catch {
              context.ui.toast.show({
                title: "Advisor",
                message: "Advisor unavailable (server plugin not loaded).",
                variant: "error",
              });
              return;
            }
            const changeNote =
              status.source === "options" ? " (in-memory only until restart)" : "";

            if (args === "off" || args === "on") {
              const result = (await advisor.setDisabled(
                { disabled: args === "off" },
                rpcLocation,
              )) as { disabled: boolean; source: string };
              context.ui.toast.show({
                title: "Advisor",
                message: result.disabled
                  ? `Advisor disabled.${changeNote}`
                  : `Advisor enabled. Models: ${status.models.join(", ")}${changeNote}`,
                variant: result.disabled ? "warning" : "success",
              });
              return;
            }

            if (args === "status") {
              await context.ui.dialog.alert({
                title: "Advisor",
                message: [
                  `Advisor: ${status.disabled ? "disabled" : "enabled"}`,
                  `Models: ${status.models.join(", ")}`,
                  `Total advisor calls: ${status.totalCalls}`,
                  `transcriptCharBudget: ${status.transcriptCharBudget}`,
                  `Config source: ${status.source}`,
                  "",
                  "Bare /advisor opens the model picker.",
                ].join("\n"),
              });
              return;
            }

            if (args.length > 0) {
              try {
                const result = (await advisor.set({ model: args }, rpcLocation)) as {
                  model: string;
                  available: boolean;
                };
                context.ui.toast.show({
                  title: "Advisor",
                  message: result.available
                    ? `Advisor set to ${result.model}.${changeNote}`
                    : `Advisor set to ${result.model} (not currently available — calls may fail until the provider is connected).${changeNote}`,
                  variant: result.available ? "success" : "warning",
                });
              } catch {
                context.ui.toast.show({
                  title: "Advisor",
                  message: `Invalid model id: "${args}". Expected provider/model, e.g. opencode/mimo-v2.6-flash-free.`,
                  variant: "error",
                });
              }
              return;
            }

            await context.data.location.model.sync(location);
            const models = context.data.location.model.list(location) ?? [];
            const picked = await context.ui.dialog.select({
              title: "Advisor model",
              current: status.models[0],
              options: models
                .filter((m) => m.enabled !== false)
                .map((m) => ({
                  title: m.name || `${m.providerID}/${m.modelID}`,
                  value: `${m.providerID}/${m.modelID}`,
                  description: `${m.providerID}/${m.modelID}`,
                  category: m.providerID,
                })),
              search: (query, opts) => {
                const q = query.toLowerCase();
                return opts.filter(
                  (o) => o.title.toLowerCase().includes(q) || (o.description ?? "").toLowerCase().includes(q),
                );
              },
            });
            if (!picked) return;
            try {
              const result = (await advisor.set({ model: picked }, rpcLocation)) as {
                model: string;
                available: boolean;
              };
              context.ui.toast.show({
                title: "Advisor",
                message: result.available
                  ? `Advisor set to ${result.model}.${changeNote}`
                  : `Advisor set to ${result.model} (not currently available — calls may fail until the provider is connected).${changeNote}`,
                variant: result.available ? "success" : "warning",
              });
            } catch {
              context.ui.toast.show({
                title: "Advisor",
                message: `Failed to set advisor model to ${picked}.`,
                variant: "error",
              });
            }
          },
        },
      ],
    }));
  },
});
