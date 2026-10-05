# opencode-advisor

Let your fast executor model consult a senior advisor model when it matters — before committing to a non-obvious approach, when an error keeps recurring, when unsure, or before declaring a task complete.

> **Requires OpenCode v2.** This plugin uses the v2 plugin API (`@opencode/plugin`) and does not work with OpenCode v1.

## What it does

- Registers an `ask_advisor` tool. The executor model calls it with a question; the plugin opens a child session with the advisor model, feeds it the current transcript plus the question, and returns the advice.
- Advisor child sessions cannot call `ask_advisor` themselves, so there is no advisor-recursion loop.
- Per-session call budget with automatic refund on failures.
- A single `/advisor` entry in the TUI: model picker dialog, on/off toggle, status, and direct model set — backed by an RPC control plane, so changes apply immediately with no restart.

## Install

```sh
opencode plugin add github:pierresabbagh-softmind/opencode-advisor
opencode service restart
```

## Usage

| Input              | Effect                                              |
| ------------------ | --------------------------------------------------- |
| `/advisor`         | Open the model picker (searchable, grouped by provider) |
| `/advisor <model>` | Make `provider/model` the primary advisor model     |
| `/advisor on`      | Enable the advisor                                   |
| `/advisor off`     | Disable the advisor                                  |
| `/advisor status`  | Show models, call counts, budgets, config source     |

Setting a model moves it to the front of the advisor model list; the rest of the list is kept as failover. The first model in the list is the primary.

Without a TUI (headless runs, API clients), manage the advisor by editing `oc-advisor.json` directly (see below) — the `ask_advisor` tool itself works everywhere.

## Configuration

Resolved in this order: plugin `options` in `opencode.jsonc` → project-local `.opencode/oc-advisor.json` → global `~/.config/opencode/oc-advisor.json` → defaults. Changes made via `/advisor` are written back to whichever side file was read (or the global one when nothing exists yet), except when options come from `opencode.jsonc` — those apply in-memory only until restart.

```jsonc
{
  // Single model or failover list (first entry is primary)
  "advisorModels": ["opencode/muse-spark-1.3-contributor-free", "opencode/mimo-v2.6-flash-free"],
  "maxCallsPerSession": 20,   // ask_advisor budget per session
  "transcriptCharBudget": 20000, // how much transcript context the advisor sees (most recent kept)
  "showAdvisorThinking": true,   // append the advisor's reasoning to its answer
  "disabled": false,
  "injectReminder": false // inject an ask_advisor reminder into session system prompts
}
```

`advisorModel` (singular string) is also accepted as shorthand for a one-model list.

## Development

```sh
bun install
bun run typecheck
bun test
```

## Credits

Inspired by [yuk1ty/oc-advisor](https://github.com/yuk1ty/oc-advisor) (MIT) and reworked for OpenCode v2 with the `/advisor` picker dialog, RPC control plane, recursion guard, failover preservation, and per-file persistence.
