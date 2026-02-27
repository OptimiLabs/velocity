# Velocity Functionality Inventory

This inventory maps what exists today in the product and how users get value from each surface.

## Primary User Loop

1. Run work in local CLI terminals.
2. Inspect outcomes, cost, and behavior.
3. Convert repeated work into reusable automation.

## Workspace Surfaces (Run + Inspect)

| Surface | User outcome | Core capability |
| --- | --- | --- |
| Console | Run Claude/Codex/Gemini work in one place | Multi-session PTY tabs, tiling, launcher, provider selection |
| Sessions | Understand each run | Session detail, hierarchy/subagents, usage + latency metadata |
| Review | Compare runs with AI support | Multi-session review workspace with saved comparisons |
| Analytics | Diagnose trends and regressions | Cross-provider metrics, compare mode, dimensions, movers, model/provider parity |
| Usage | Track spend and token growth | Block/day/week/month usage and cost breakdowns |

## Build Surfaces (Reuse + Automate)

| Surface | User outcome | Core capability |
| --- | --- | --- |
| Agents | Reusable role-based workers | File-backed agents, AI/manual creation, provider + project scope |
| Workflows | Multi-step orchestrations | AI plan generation, node graph builder, scoped agents, launch path |
| Skills | Reusable instruction packs | Global/project/provider scope, activation paths |
| Commands | Fast command entry | Provider-scoped command metadata + slash/$ compatibility |
| Hooks | Lifecycle automation | Claude and Gemini hook configuration and templates |
| MCP | External tool access | MCP server inventory, tool discovery, usage visibility |
| Routing | Context dependency clarity | Entrypoint-scoped graph, filters, manual edge linking |

## Platform Surfaces (Configure + Extend)

| Surface | User outcome | Core capability |
| --- | --- | --- |
| Models | Better model choice | Provider model capability snapshots and comparisons |
| Plugins | Claude plugin management | Provider-scoped plugin control (Claude scope) |
| Marketplace | Install reusable assets | Remote package discovery/install for agents/skills/hooks/MCP |
| Settings | Deterministic local behavior | Core settings + provider-specific controls |

## Workflow System Map

Workflows include four concrete paths:

1. `Plan`: AI-assisted generation (`CreateWorkflowModal`) with complexity + agent strategy.
2. `Build`: graph editing (`WorkflowCanvasBuilder`) with node dependencies and scoped agent overrides.
3. `Launch`: execute from workflow list/detail into console workflow sessions.
4. `Deploy`: provider-aware command artifacts (`/<name>` for Claude/Gemini, `$<name>` or picker for Codex).

The workflow data model is provider-aware and project-aware:

- `workflows.provider`, `workflows.project_id`, `workflows.project_path`
- `workflow_agents.workflow_id` with unique `(workflow_id, name)` scoped agent definitions

## Routing System Map

Routing provides provider-scoped graph exploration of instruction context:

1. Scan/discover instruction nodes and references.
2. Persist nodes/edges in SQLite (`routing_nodes`, `routing_edges`).
3. Filter by provider, entrypoint, node type, and edge type.
4. Inspect detail panel and manually add/remove edges.

Key indexing support for performance:

- `idx_routing_nodes_provider`
- `idx_ke_source`
- `idx_ke_target`

## AI Assist Surfaces

AI assist currently appears in:

1. Workflow generation (`CreateWorkflowModal`).
2. Agent generation and chat editing (`AgentBuilder`, `AgentBuilderChat`).
3. Assisted configuration flows in selected settings/build surfaces.

Design principle: if users do not provide enough detail, AI should generate a safe, useful default; if users specify exact constraints, generation should preserve those constraints.

## Database and Index Coverage Highlights

Frequently hit tables already include dedicated indexes for list/sort/filter performance:

- Sessions: provider/date/project/active/role/parent/compression/pricing indexes.
- Projects: path and activity indexes.
- Workflows: status/updated/project indexes.
- Routing: provider/source/target indexes.
- Workflow agents: workflow index.

This supports parity across Claude/Codex/Gemini dashboards while keeping query latency stable on larger local datasets.
