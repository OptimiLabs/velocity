import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { initSchema } from "../../lib/db/schema";
import type { ConfigProvider } from "../../types/provider";
import type { WorkflowEdge, WorkflowNode } from "../../types/workflow";

interface CliOptions {
  dbPath: string;
  workspaceRoot: string;
}

interface WorkflowSeed {
  id: string;
  provider: ConfigProvider;
  projectId: string;
  projectPath: string;
  name: string;
  description: string;
  generatedPlan: string;
  commandName: string;
  commandDescription: string;
  activationContext: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface RoutingNodeSeed {
  id: string;
  absolutePath: string;
  label: string;
  nodeType: "claude-md" | "skill" | "agent" | "knowledge";
  projectRoot: string | null;
  provider: ConfigProvider;
}

interface RoutingEdgeSeed {
  id: string;
  source: string;
  target: string;
  context: string;
  referenceType:
    | "path"
    | "tilde-path"
    | "relative-path"
    | "inline-mention"
    | "table-entry"
    | "structural"
    | "manual";
  isManual: 0 | 1;
}

const DEMO_WORKFLOW_IDS = [
  "wf_demo_claude_release",
  "wf_demo_claude_incident",
  "wf_demo_codex_backlog",
  "wf_demo_gemini_docs",
];

const DEMO_PROJECT_IDS = [
  "demo-project-claude",
  "demo-project-codex",
  "demo-project-gemini",
];

function parseCliArgs(): CliOptions {
  const args = process.argv.slice(2);
  const getArgValue = (name: string): string | undefined => {
    const index = args.indexOf(name);
    if (index === -1) return undefined;
    return args[index + 1];
  };

  const dbPath =
    getArgValue("--db-path") ??
    path.join(os.homedir(), ".claude", "dashboard.db");
  const workspaceRoot =
    getArgValue("--workspace-root") ??
    path.join(os.homedir(), ".velocity-demo");

  return { dbPath, workspaceRoot };
}

function isoMinutesAgo(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function buildWorkflowSeeds(workspaceRoot: string): WorkflowSeed[] {
  const claudeProjectPath = path.join(workspaceRoot, "claude-app");
  const codexProjectPath = path.join(workspaceRoot, "codex-app");
  const geminiProjectPath = path.join(workspaceRoot, "gemini-app");

  return [
    {
      id: "wf_demo_claude_release",
      provider: "claude",
      projectId: "demo-project-claude",
      projectPath: claudeProjectPath,
      name: "Release Train Orchestrator",
      description:
        "Plan, implement, validate, and ship a weekly release with scoped agents.",
      generatedPlan: [
        "1. Intake release goals and pending PRs.",
        "2. Assign implementation and validation tasks.",
        "3. Aggregate risk summary and publish release notes.",
      ].join("\n"),
      commandName: "release-train",
      commandDescription:
        "Generate and execute a weekly release coordination workflow.",
      activationContext: "When preparing a release branch and release notes.",
      nodes: [
        {
          id: "intake-1",
          label: "Intake",
          taskDescription:
            "Gather PRs, changelog entries, and rollout constraints for this release.",
          agentName: "release-intake",
          model: "claude-opus-4.1",
          effort: "medium",
          skills: ["release-intel"],
          status: "ready",
          position: { x: 100, y: 130 },
          dependsOn: [],
        },
        {
          id: "implement-1",
          label: "Implement",
          taskDescription:
            "Apply required code updates and align migration steps.",
          agentName: "release-implementer",
          model: "claude-sonnet-4.5",
          effort: "high",
          skills: ["repo-surgeon"],
          status: "ready",
          position: { x: 380, y: 90 },
          dependsOn: ["intake-1"],
        },
        {
          id: "validate-1",
          label: "Validate",
          taskDescription:
            "Run unit, integration, and smoke checks. Flag regressions with owner mapping.",
          agentName: "release-validator",
          model: "claude-sonnet-4.5",
          effort: "medium",
          skills: ["qa-operator"],
          status: "ready",
          position: { x: 380, y: 220 },
          dependsOn: ["intake-1"],
        },
        {
          id: "ship-1",
          label: "Ship",
          taskDescription:
            "Publish release notes, deployment plan, and rollback guidance.",
          agentName: "release-publisher",
          model: "claude-opus-4.1",
          effort: "low",
          skills: ["release-docs"],
          status: "ready",
          position: { x: 680, y: 160 },
          dependsOn: ["implement-1", "validate-1"],
        },
      ],
      edges: [
        { id: "intake-1->implement-1", source: "intake-1", target: "implement-1" },
        { id: "intake-1->validate-1", source: "intake-1", target: "validate-1" },
        { id: "implement-1->ship-1", source: "implement-1", target: "ship-1" },
        { id: "validate-1->ship-1", source: "validate-1", target: "ship-1" },
      ],
    },
    {
      id: "wf_demo_claude_incident",
      provider: "claude",
      projectId: "demo-project-claude",
      projectPath: claudeProjectPath,
      name: "Incident Response Drill",
      description:
        "Triages alerts, gathers traces, and coordinates mitigation tasks.",
      generatedPlan: [
        "1. Classify incident severity and impacted services.",
        "2. Collect logs and traces.",
        "3. Draft mitigation + communication updates.",
      ].join("\n"),
      commandName: "incident-drill",
      commandDescription:
        "Create a repeatable incident triage and mitigation workflow.",
      activationContext: "When production incidents or severe alerts fire.",
      nodes: [
        {
          id: "triage-1",
          label: "Triage",
          taskDescription: "Classify severity and identify impacted components.",
          agentName: "incident-triage",
          model: "claude-sonnet-4.5",
          effort: "medium",
          status: "ready",
          position: { x: 100, y: 120 },
          dependsOn: [],
        },
        {
          id: "forensics-1",
          label: "Forensics",
          taskDescription: "Collect timeline, traces, and suspicious deltas.",
          agentName: "incident-forensics",
          model: "claude-opus-4.1",
          effort: "high",
          status: "ready",
          position: { x: 380, y: 120 },
          dependsOn: ["triage-1"],
        },
        {
          id: "mitigation-1",
          label: "Mitigate",
          taskDescription:
            "Generate fix options, rollback strategy, and internal status update.",
          agentName: "incident-mitigation",
          model: "claude-opus-4.1",
          effort: "medium",
          status: "ready",
          position: { x: 660, y: 120 },
          dependsOn: ["forensics-1"],
        },
      ],
      edges: [
        { id: "triage-1->forensics-1", source: "triage-1", target: "forensics-1" },
        {
          id: "forensics-1->mitigation-1",
          source: "forensics-1",
          target: "mitigation-1",
        },
      ],
    },
    {
      id: "wf_demo_codex_backlog",
      provider: "codex",
      projectId: "demo-project-codex",
      projectPath: codexProjectPath,
      name: "Backlog Refinement Flow",
      description:
        "Turns backlog items into grouped implementation tasks and risk notes.",
      generatedPlan: [
        "1. Parse backlog tickets.",
        "2. Group by dependency and scope.",
        "3. Draft implementation order with risk notes.",
      ].join("\n"),
      commandName: "backlog-refine",
      commandDescription: "Create an implementation-ready backlog plan.",
      activationContext: "When sprint planning starts.",
      nodes: [
        {
          id: "collect-1",
          label: "Collect Tickets",
          taskDescription:
            "Read and normalize backlog issues from tracker exports.",
          agentName: "codex-collector",
          model: "gpt-5-codex",
          effort: "medium",
          status: "ready",
          position: { x: 90, y: 140 },
          dependsOn: [],
        },
        {
          id: "cluster-1",
          label: "Cluster",
          taskDescription: "Cluster related work by dependency graph.",
          agentName: "codex-cluster",
          model: "gpt-5-codex",
          effort: "high",
          status: "ready",
          position: { x: 360, y: 140 },
          dependsOn: ["collect-1"],
        },
        {
          id: "plan-1",
          label: "Plan",
          taskDescription: "Output sprint-ready order and owner suggestions.",
          agentName: "codex-planner",
          model: "gpt-5-codex",
          effort: "medium",
          status: "ready",
          position: { x: 630, y: 140 },
          dependsOn: ["cluster-1"],
        },
      ],
      edges: [
        { id: "collect-1->cluster-1", source: "collect-1", target: "cluster-1" },
        { id: "cluster-1->plan-1", source: "cluster-1", target: "plan-1" },
      ],
    },
    {
      id: "wf_demo_gemini_docs",
      provider: "gemini",
      projectId: "demo-project-gemini",
      projectPath: geminiProjectPath,
      name: "Docs Sync Automation",
      description:
        "Synchronizes code changes with docs, guides, and changelog summaries.",
      generatedPlan: [
        "1. Inspect merged PRs.",
        "2. Detect outdated docs.",
        "3. Publish updated docs and release summary.",
      ].join("\n"),
      commandName: "docs-sync",
      commandDescription: "Keep docs current after code merges.",
      activationContext: "After merged pull requests each day.",
      nodes: [
        {
          id: "scan-1",
          label: "Scan Changes",
          taskDescription:
            "Read recent merged PRs and identify changed modules.",
          agentName: "gemini-scan",
          model: "gemini-2.5-pro",
          effort: "medium",
          status: "ready",
          position: { x: 90, y: 140 },
          dependsOn: [],
        },
        {
          id: "rewrite-1",
          label: "Rewrite Docs",
          taskDescription:
            "Draft updates for docs pages impacted by module changes.",
          agentName: "gemini-docs",
          model: "gemini-2.5-pro",
          effort: "high",
          status: "ready",
          position: { x: 360, y: 100 },
          dependsOn: ["scan-1"],
        },
        {
          id: "changelog-1",
          label: "Changelog",
          taskDescription: "Summarize customer-facing changes for release notes.",
          agentName: "gemini-changelog",
          model: "gemini-2.5-flash",
          effort: "low",
          status: "ready",
          position: { x: 360, y: 220 },
          dependsOn: ["scan-1"],
        },
        {
          id: "publish-1",
          label: "Publish",
          taskDescription: "Open final docs PR and notify maintainers.",
          agentName: "gemini-publish",
          model: "gemini-2.5-flash",
          effort: "low",
          status: "ready",
          position: { x: 640, y: 160 },
          dependsOn: ["rewrite-1", "changelog-1"],
        },
      ],
      edges: [
        { id: "scan-1->rewrite-1", source: "scan-1", target: "rewrite-1" },
        { id: "scan-1->changelog-1", source: "scan-1", target: "changelog-1" },
        { id: "rewrite-1->publish-1", source: "rewrite-1", target: "publish-1" },
        {
          id: "changelog-1->publish-1",
          source: "changelog-1",
          target: "publish-1",
        },
      ],
    },
  ];
}

function buildRoutingSeeds(workspaceRoot: string): {
  nodes: RoutingNodeSeed[];
  edges: RoutingEdgeSeed[];
} {
  const providers: ConfigProvider[] = ["claude", "codex", "gemini"];
  const nodes: RoutingNodeSeed[] = [];
  const edges: RoutingEdgeSeed[] = [];

  for (const provider of providers) {
    const entryFile =
      provider === "codex"
        ? "AGENTS.md"
        : provider === "gemini"
          ? "GEMINI.md"
          : "CLAUDE.md";
    const providerHome = path.join(os.homedir(), ".velocity-demo", provider);
    const projectRoot = path.join(workspaceRoot, `${provider}-app`);

    const globalEntryId = path.join(providerHome, entryFile);
    const projectEntryId = path.join(projectRoot, entryFile);
    const skillId = path.join(projectRoot, ".claude", "skills", "release-map", "SKILL.md");
    const agentId = path.join(projectRoot, ".claude", "agents", "release-planner.md");
    const knowledgeId = path.join(projectRoot, "docs", "release-checklist.md");
    const playbookId = path.join(projectRoot, "docs", "rollback-playbook.md");

    nodes.push(
      {
        id: globalEntryId,
        absolutePath: globalEntryId,
        label: entryFile,
        nodeType: "claude-md",
        projectRoot: null,
        provider,
      },
      {
        id: projectEntryId,
        absolutePath: projectEntryId,
        label: entryFile,
        nodeType: "claude-md",
        projectRoot,
        provider,
      },
      {
        id: skillId,
        absolutePath: skillId,
        label: "SKILL.md",
        nodeType: "skill",
        projectRoot,
        provider,
      },
      {
        id: agentId,
        absolutePath: agentId,
        label: "release-planner.md",
        nodeType: "agent",
        projectRoot,
        provider,
      },
      {
        id: knowledgeId,
        absolutePath: knowledgeId,
        label: "release-checklist.md",
        nodeType: "knowledge",
        projectRoot,
        provider,
      },
      {
        id: playbookId,
        absolutePath: playbookId,
        label: "rollback-playbook.md",
        nodeType: "knowledge",
        projectRoot,
        provider,
      },
    );

    edges.push(
      {
        id: `demo::${provider}::global-entry`,
        source: globalEntryId,
        target: projectEntryId,
        context: "provider bootstrap",
        referenceType: "path",
        isManual: 0,
      },
      {
        id: `demo::${provider}::entry-skill`,
        source: projectEntryId,
        target: skillId,
        context: "skills table",
        referenceType: "table-entry",
        isManual: 0,
      },
      {
        id: `demo::${provider}::entry-agent`,
        source: projectEntryId,
        target: agentId,
        context: "agents table",
        referenceType: "table-entry",
        isManual: 0,
      },
      {
        id: `demo::${provider}::skill-checklist`,
        source: skillId,
        target: knowledgeId,
        context: "inline mention",
        referenceType: "inline-mention",
        isManual: 0,
      },
      {
        id: `demo::${provider}::agent-playbook`,
        source: agentId,
        target: playbookId,
        context: "relative include",
        referenceType: "relative-path",
        isManual: 0,
      },
      {
        id: `demo::${provider}::manual-link`,
        source: agentId,
        target: skillId,
        context: "manual verification loop",
        referenceType: "manual",
        isManual: 1,
      },
    );
  }

  return { nodes, edges };
}

function buildProjects(workspaceRoot: string): Array<{
  id: string;
  path: string;
  name: string;
}> {
  return [
    {
      id: "demo-project-claude",
      path: path.join(workspaceRoot, "claude-app"),
      name: "Claude Demo Project",
    },
    {
      id: "demo-project-codex",
      path: path.join(workspaceRoot, "codex-app"),
      name: "Codex Demo Project",
    },
    {
      id: "demo-project-gemini",
      path: path.join(workspaceRoot, "gemini-app"),
      name: "Gemini Demo Project",
    },
  ];
}

function upsertProjects(
  db: Database.Database,
  projects: Array<{ id: string; path: string; name: string }>,
): void {
  const stmt = db.prepare(`
    INSERT INTO projects (id, path, name, session_count, total_tokens, total_cost, last_activity_at, created_at)
    VALUES (@id, @path, @name, 0, 0, 0, @lastActivityAt, @createdAt)
    ON CONFLICT(id) DO UPDATE SET
      path = excluded.path,
      name = excluded.name,
      last_activity_at = excluded.last_activity_at
  `);

  for (const [index, project] of projects.entries()) {
    stmt.run({
      id: project.id,
      path: project.path,
      name: project.name,
      lastActivityAt: isoMinutesAgo(index * 10),
      createdAt: isoMinutesAgo(180 + index * 10),
    });
  }
}

function upsertWorkflows(db: Database.Database, workflows: WorkflowSeed[]): void {
  const workflowStmt = db.prepare(`
    INSERT INTO workflows (
      id, provider, name, description, generated_plan, nodes, edges, cwd, status,
      command_name, command_description, activation_context, auto_skill_enabled,
      project_id, project_path, created_at, updated_at
    ) VALUES (
      @id, @provider, @name, @description, @generatedPlan, @nodes, @edges, @cwd, 'draft',
      @commandName, @commandDescription, @activationContext, 1,
      @projectId, @projectPath, @createdAt, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      provider = excluded.provider,
      name = excluded.name,
      description = excluded.description,
      generated_plan = excluded.generated_plan,
      nodes = excluded.nodes,
      edges = excluded.edges,
      cwd = excluded.cwd,
      command_name = excluded.command_name,
      command_description = excluded.command_description,
      activation_context = excluded.activation_context,
      auto_skill_enabled = excluded.auto_skill_enabled,
      project_id = excluded.project_id,
      project_path = excluded.project_path,
      updated_at = excluded.updated_at
  `);

  const cleanupAgentsStmt = db.prepare(
    "DELETE FROM workflow_agents WHERE workflow_id = ?",
  );
  const insertAgentStmt = db.prepare(`
    INSERT INTO workflow_agents (
      id, workflow_id, name, description, model, effort, tools, disallowed_tools,
      color, icon, category, prompt, skills, created_at, updated_at
    ) VALUES (
      @id, @workflowId, @name, @description, @model, @effort, @tools, @disallowedTools,
      @color, @icon, @category, @prompt, @skills, @createdAt, @updatedAt
    )
  `);

  for (const [index, workflow] of workflows.entries()) {
    const createdAt = isoMinutesAgo(240 - index * 5);
    const updatedAt = isoMinutesAgo(45 - index * 3);
    workflowStmt.run({
      id: workflow.id,
      provider: workflow.provider,
      name: workflow.name,
      description: workflow.description,
      generatedPlan: workflow.generatedPlan,
      nodes: JSON.stringify(workflow.nodes),
      edges: JSON.stringify(workflow.edges),
      cwd: workflow.projectPath,
      commandName: workflow.commandName,
      commandDescription: workflow.commandDescription,
      activationContext: workflow.activationContext,
      projectId: workflow.projectId,
      projectPath: workflow.projectPath,
      createdAt,
      updatedAt,
    });

    cleanupAgentsStmt.run(workflow.id);
    const uniqueAgents = new Set(
      workflow.nodes
        .map((node) => node.agentName)
        .filter((name): name is string => Boolean(name)),
    );

    let agentIndex = 0;
    for (const agentName of uniqueAgents) {
      const canonicalNode = workflow.nodes.find((node) => node.agentName === agentName);
      insertAgentStmt.run({
        id: `wa_demo_${workflow.id}_${agentIndex}`,
        workflowId: workflow.id,
        name: agentName,
        description: canonicalNode?.taskDescription ?? `${agentName} scoped role`,
        model: canonicalNode?.model ?? null,
        effort: canonicalNode?.effort ?? null,
        tools: JSON.stringify(["Read", "Edit", "Bash"]),
        disallowedTools: JSON.stringify([]),
        color: "#4f46e5",
        icon: "bot",
        category: "workflow",
        prompt: `# ${agentName}\n\nExecute assigned step in ${workflow.name}.`,
        skills: JSON.stringify(canonicalNode?.skills ?? []),
        createdAt,
        updatedAt,
      });
      agentIndex += 1;
    }
  }
}

function upsertRouting(
  db: Database.Database,
  routing: { nodes: RoutingNodeSeed[]; edges: RoutingEdgeSeed[] },
): void {
  const scannedAt = new Date().toISOString();
  const nodeStmt = db.prepare(`
    INSERT INTO routing_nodes (
      id, absolute_path, label, node_type, project_root,
      exists_on_disk, position_x, position_y, file_size, last_modified, scanned_at, provider
    ) VALUES (
      @id, @absolutePath, @label, @nodeType, @projectRoot,
      0, NULL, NULL, NULL, NULL, @scannedAt, @provider
    )
    ON CONFLICT(id) DO UPDATE SET
      absolute_path = excluded.absolute_path,
      label = excluded.label,
      node_type = excluded.node_type,
      project_root = excluded.project_root,
      exists_on_disk = excluded.exists_on_disk,
      scanned_at = excluded.scanned_at,
      provider = excluded.provider
  `);

  const edgeStmt = db.prepare(`
    INSERT INTO routing_edges (
      id, source, target, context, reference_type, is_manual, scanned_at
    ) VALUES (
      @id, @source, @target, @context, @referenceType, @isManual, @scannedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      source = excluded.source,
      target = excluded.target,
      context = excluded.context,
      reference_type = excluded.reference_type,
      is_manual = excluded.is_manual,
      scanned_at = excluded.scanned_at
  `);

  for (const node of routing.nodes) {
    nodeStmt.run({
      id: node.id,
      absolutePath: node.absolutePath,
      label: node.label,
      nodeType: node.nodeType,
      projectRoot: node.projectRoot,
      scannedAt,
      provider: node.provider,
    });
  }

  for (const edge of routing.edges) {
    edgeStmt.run({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      context: edge.context,
      referenceType: edge.referenceType,
      isManual: edge.isManual,
      scannedAt,
    });
  }

  db.prepare(
    "INSERT OR REPLACE INTO index_metadata (key, value) VALUES ('routing_last_scanned_at', ?)",
  ).run(scannedAt);
  db.prepare(
    "INSERT OR REPLACE INTO index_metadata (key, value) VALUES ('routing_scan_duration_ms', ?)",
  ).run("1320");
}

function cleanupDemoRows(db: Database.Database): void {
  const demoRootPattern = `${path.join(os.homedir(), ".velocity-demo").replace(/\\/g, "/")}%`;
  const projectLikePattern = `${path
    .join(os.homedir(), ".velocity-demo")
    .replace(/\\/g, "/")}%`;

  db.prepare("DELETE FROM workflow_agents WHERE workflow_id LIKE 'wf_demo_%'").run();
  db.prepare("DELETE FROM workflows WHERE id LIKE 'wf_demo_%'").run();
  db.prepare(
    "DELETE FROM routing_edges WHERE id LIKE 'demo::%' OR source LIKE ? OR target LIKE ?",
  ).run(demoRootPattern, demoRootPattern);
  db.prepare("DELETE FROM routing_nodes WHERE id LIKE ?").run(demoRootPattern);
  db.prepare("DELETE FROM projects WHERE id LIKE 'demo-project-%' OR path LIKE ?").run(
    projectLikePattern,
  );
}

function ensureFolders(workspaceRoot: string): void {
  fs.mkdirSync(workspaceRoot, { recursive: true });
}

function main(): void {
  const options = parseCliArgs();
  ensureFolders(options.workspaceRoot);

  const dbDir = path.dirname(options.dbPath);
  fs.mkdirSync(dbDir, { recursive: true });

  const db = new Database(options.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  initSchema(db);

  const workflows = buildWorkflowSeeds(options.workspaceRoot);
  const projects = buildProjects(options.workspaceRoot);
  const routing = buildRoutingSeeds(options.workspaceRoot);

  const tx = db.transaction(() => {
    cleanupDemoRows(db);
    upsertProjects(db, projects);
    upsertWorkflows(db, workflows);
    upsertRouting(db, routing);
  });

  tx();
  db.close();

  const message = [
    "Seeded deterministic demo data:",
    `- DB: ${options.dbPath}`,
    `- Projects: ${DEMO_PROJECT_IDS.length}`,
    `- Workflows: ${DEMO_WORKFLOW_IDS.length}`,
    `- Routing nodes: ${routing.nodes.length}`,
    `- Routing edges: ${routing.edges.length}`,
  ].join("\n");
  // eslint-disable-next-line no-console
  console.log(message);
}

main();
