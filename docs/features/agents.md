# Agents [Status: Stable]

AI agent builder with configurable models, tools, and orchestration patterns. Define reusable agent profiles that can be launched in console sessions or composed into multi-agent workflows.

## How It Works

### Architecture

1. **Agent Builder** -- `components/agents/AgentBuilder.tsx` provides a form-based interface for configuring agents. `AgentBuilderChat.tsx` adds a conversational interface where an AI assistant helps design the agent configuration interactively.

2. **Agent Configuration** -- Each agent has a name, system prompt, model selection, allowed tools, and optional hook configurations. `AgentConfigPanel.tsx` and `AgentEditor.tsx` provide the editing UI.

3. **Agent Graph** -- `AgentGraph.tsx` visualizes agent relationships and hierarchies using @xyflow/react. `AgentNode.tsx` renders individual agent nodes in the graph.

4. **Storage** -- Agents are persisted via `/api/agents` with CRUD operations. The `useAgents`, `useSaveAgent`, and `useDeleteAgent` hooks manage data fetching and mutations.

5. **Routing** -- `RoutingTab.tsx` and `RoutingDetailPanel.tsx` configure how tasks are routed between agents in multi-agent setups.

### Data Flow

1. User creates an agent via the builder or chat interface
2. Configuration is saved via `useSaveAgent` to `/api/agents`
3. Agent appears in the agent list (`AgentsTab.tsx`)
4. Agent can be selected when launching a console session (via `AgentPicker.tsx`)
5. Agent can be added as a node in workflow graphs

### Key Components

- `AgentBuilder.tsx` -- Form-based agent configuration
- `AgentBuilderChat.tsx` -- Conversational agent design assistant
- `AgentConfigPanel.tsx` -- Detailed agent settings panel
- `AgentsTab.tsx` -- Agent list and management view
- `AgentGraph.tsx` -- Visual agent relationship graph
- `EntryPointCard.tsx` -- Configure agent entry points
- `TeamPresets.tsx` -- Pre-built multi-agent team configurations
- `WorkflowsTab.tsx` / `WorkflowsView.tsx` -- Workflows associated with agents

## Usage

### Creating an agent

1. Navigate to the Agents page from the sidebar
2. Click "New Agent" to open the builder
3. Configure the agent:
   - **Name**: Identifier used to reference the agent
   - **System Prompt**: Instructions that define the agent's behavior
   - **Model**: Which runtime model to use for the selected provider (Claude/Codex/Gemini)
   - **Tools**: Which tools the agent is allowed to use
4. Save the agent

### Using the chat builder

1. Open the agent builder chat interface
2. Describe the agent you want to create in natural language
3. The assistant generates a configuration based on your description and selected generation provider
4. Review and adjust the generated configuration
5. Save when satisfied

### Launching an agent in the console

1. Open a new console tab
2. Use the Agent Picker to select a saved agent profile
3. The console session launches with the agent's configuration applied

### Building agent teams

1. Use the Routing tab to define how tasks flow between agents
2. Configure entry points to determine which agent handles initial requests
3. Use Team Presets for common multi-agent patterns

## Related Files

- `hooks/useAgents.ts` -- React Query hooks for agent CRUD
- `hooks/useAgentBuilderChat.ts` -- Hook for conversational agent builder
- `hooks/useAgentLaunch.ts` -- Hook for launching agents in console
- `components/agents/AgentBuilder.tsx` -- Agent configuration form
- `components/agents/AgentBuilderChat.tsx` -- Chat-based agent design
- `components/agents/AgentConfigPanel.tsx` -- Agent settings panel
- `components/agents/AgentsTab.tsx` -- Agent list view
- `components/agents/AgentGraph.tsx` -- Agent relationship visualization
- `components/agents/RoutingTab.tsx` -- Task routing configuration
- `components/agents/TeamPresets.tsx` -- Pre-built team templates
- `app/agents/page.tsx` -- Agents page route
- `app/api/agents/` -- API routes for agent CRUD
- `types/agent.ts` -- TypeScript types for agent configuration
