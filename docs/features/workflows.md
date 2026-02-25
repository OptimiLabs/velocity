# Workflows [Status: Stable]

Visual canvas builder for designing multi-step agent orchestrations. Built on @xyflow/react, workflows allow you to define sequences of Claude Code tasks as a directed graph with configurable steps, connections, and activation contexts.

## How It Works

### Architecture

1. **Canvas Builder** -- `components/workflows/WorkflowCanvasBuilder.tsx` provides the visual drag-and-drop canvas powered by @xyflow/react. Users add step nodes, connect them with edges, and configure each step's behavior.

2. **Step Nodes** -- `WorkflowStepNode.tsx` renders individual steps on the canvas. Each node represents a task with a prompt, optional model override, and connection points for sequencing.

3. **Workflow Storage** -- Workflows are persisted via `/api/workflows` as JSON containing node positions, edge connections, metadata (name, description, working directory), and an optional AI-generated plan.

4. **Execution** -- Workflows can be deployed and executed, running each step in sequence or parallel according to the graph edges. The `DeployDialog.tsx` handles deployment configuration.

5. **Activation Contexts** -- `ActivationContextModal.tsx` lets users define when a workflow should be suggested or auto-activated based on project context.

### Data Flow

1. User creates a new workflow via `CreateWorkflowModal.tsx`
2. The canvas builder opens with an empty graph
3. User adds step nodes and connects them with edges
4. Each step is configured with a prompt and optional parameters
5. Workflow is saved via `useCreateWorkflow` / `useUpdateWorkflow` hooks
6. Workflow can be deployed and executed from the workflows list

### Key Components

- `WorkflowCanvasBuilder.tsx` -- @xyflow/react canvas with node/edge management
- `WorkflowStepNode.tsx` -- Visual representation of a single workflow step
- `WorkflowsList.tsx` -- List view of all saved workflows with status indicators
- `WorkflowTabBar.tsx` -- Navigation between workflow views
- `CreateWorkflowModal.tsx` -- New workflow creation dialog
- `DeployDialog.tsx` -- Deployment configuration

## Usage

### Creating a workflow

1. Navigate to the Workflows page from the sidebar
2. Click "New Workflow"
3. Enter a name and optional description
4. The canvas builder opens with an empty graph

### Building the graph

1. Click to add step nodes to the canvas
2. Drag from a node's output handle to another node's input handle to create connections
3. Click on a step node to configure its prompt and settings
4. Steps connected in sequence execute one after another
5. Steps with no dependency between them can execute in parallel

### Managing workflows

- **Edit**: Click on a workflow in the list to re-open the canvas builder
- **Duplicate**: Create a copy of an existing workflow as a starting point
- **Delete**: Remove a workflow from the list
- **Deploy**: Configure and launch a workflow for execution

## Related Files

- `hooks/useWorkflows.ts` -- React Query hooks for CRUD operations on workflows
- `components/workflows/WorkflowCanvasBuilder.tsx` -- Visual canvas builder
- `components/workflows/WorkflowStepNode.tsx` -- Step node component
- `components/workflows/WorkflowsList.tsx` -- Workflow list page
- `components/workflows/CreateWorkflowModal.tsx` -- New workflow dialog
- `components/workflows/DeployDialog.tsx` -- Deployment configuration
- `components/workflows/ActivationContextModal.tsx` -- Activation context setup
- `app/workflows/page.tsx` -- Workflows page route (if present) or accessed via app layout
- `app/api/workflows/` -- API routes for workflow CRUD
- `types/workflow.ts` -- TypeScript types for workflows, nodes, and edges
