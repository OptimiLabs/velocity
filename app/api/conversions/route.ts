import { NextResponse } from "next/server";
import { getInstructionFile } from "@/lib/db/instruction-files";
import { getSkill, getProjectSkill } from "@/lib/skills";
import { getCodexInstruction } from "@/lib/codex/skills";
import {
  convertAgentTargets,
  convertHookTargets,
  convertInstructionTargets,
  convertSkillTargets,
  convertWorkflowTargets,
  saveConvertedResults,
} from "@/lib/conversion/artifacts";
import { getWorkflow } from "@/lib/db/workflows";
import type {
  ArtifactType,
  ProviderTargetMode,
} from "@/types/provider-artifacts";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowScopedAgent,
} from "@/types/workflow";

type ConversionRequest = {
  artifactType: ArtifactType;
  targetProvider?: ProviderTargetMode;
  targets?: ("claude" | "codex" | "gemini")[];
  mode?: "preview" | "save";
  overwrite?: boolean;
  source:
    | {
        kind: "inline";
        data: Record<string, unknown>;
      }
    | {
        kind: "instruction";
        id: string;
      }
    | {
        kind: "skill";
        name: string;
        provider?: "claude" | "codex" | "gemini";
        projectPath?: string;
      }
    | {
        kind: "agent";
        name: string;
        provider?: "claude" | "codex" | "gemini";
        projectPath?: string;
      }
    | {
        kind: "workflow";
        id: string;
        provider?: "claude" | "codex" | "gemini";
      };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ConversionRequest;
    const artifactType = body.artifactType;
    const targetProvider = body.targetProvider ?? body.targets ?? "all";
    const mode = body.mode ?? "preview";
    const overwrite = body.overwrite ?? false;

    if (
      artifactType !== "agent" &&
      artifactType !== "skill" &&
      artifactType !== "hook" &&
      artifactType !== "instruction" &&
      artifactType !== "workflow"
    ) {
      return NextResponse.json({ error: "invalid artifactType" }, { status: 400 });
    }
    if (!body.source || typeof body.source !== "object") {
      return NextResponse.json({ error: "source is required" }, { status: 400 });
    }

    if (artifactType === "instruction") {
      let source: {
        content: string;
        fileName?: string;
        projectPath?: string | null;
        filePath?: string;
      };
      if (body.source.kind === "instruction") {
        const file = getInstructionFile(body.source.id);
        if (!file) {
          return NextResponse.json({ error: "Instruction file not found" }, { status: 404 });
        }
        source = {
          content: file.content,
          fileName: file.fileName,
          projectPath: file.projectPath,
          filePath: file.filePath,
        };
      } else if (body.source.kind === "inline") {
        source = {
          content: String(body.source.data.content ?? ""),
          fileName:
            typeof body.source.data.fileName === "string"
              ? body.source.data.fileName
              : undefined,
          projectPath:
            typeof body.source.data.projectPath === "string"
              ? body.source.data.projectPath
              : null,
        };
      } else {
        return NextResponse.json(
          { error: "instruction conversions require source.kind=instruction|inline" },
          { status: 400 },
        );
      }

      if (!source.content.trim()) {
        return NextResponse.json({ error: "source content is required" }, { status: 400 });
      }

      let results = convertInstructionTargets(source, targetProvider);
      if (mode === "save") {
        results = await saveConvertedResults({
          artifactType,
          source: { projectPath: source.projectPath ?? null },
          overwrite,
          results,
        });
      }
      return NextResponse.json({
        artifactType,
        targetProvider,
        results,
        primary: results[0] ?? null,
      });
    }

    if (artifactType === "skill") {
      let source: {
        name: string;
        description?: string;
        content: string;
        category?: string;
        visibility?: "global" | "project";
        projectPath?: string;
      };

      if (body.source.kind === "skill") {
        const sourceRef = body.source as Extract<
          ConversionRequest["source"],
          { kind: "skill" }
        >;
        const srcProvider = sourceRef.provider ?? "claude";
        if (srcProvider === "codex") {
          const inst = getCodexInstruction(sourceRef.name, sourceRef.projectPath);
          if (!inst) {
            return NextResponse.json({ error: "Codex instruction not found" }, { status: 404 });
          }
          source = {
            name: inst.name,
            content: inst.content,
            visibility: inst.visibility,
            projectPath: inst.projectPath,
          };
        } else if (srcProvider === "gemini") {
          const { getGeminiSkill } = await import("@/lib/gemini/skills");
          const geminiSkill = getGeminiSkill(sourceRef.name, sourceRef.projectPath);
          if (!geminiSkill) {
            return NextResponse.json({ error: "Gemini skill not found" }, { status: 404 });
          }
          source = {
            name: geminiSkill.name,
            content: geminiSkill.content,
            visibility: geminiSkill.visibility,
            projectPath: geminiSkill.projectPath,
          };
        } else if (sourceRef.projectPath) {
          const skill = getProjectSkill(sourceRef.projectPath, sourceRef.name);
          if (!skill) {
            return NextResponse.json({ error: "Project skill not found" }, { status: 404 });
          }
          source = {
            name: skill.name,
            description: skill.description,
            content: skill.content,
            category: skill.category,
            visibility: "project",
            projectPath: sourceRef.projectPath,
          };
        } else {
          const skill = getSkill(sourceRef.name);
          if (!skill) {
            return NextResponse.json({ error: "Skill not found" }, { status: 404 });
          }
          source = {
            name: skill.name,
            description: skill.description,
            content: skill.content,
            category: skill.category,
            visibility: "global",
          };
        }
      } else if (body.source.kind === "inline") {
        source = {
          name: String(body.source.data.name ?? "").trim(),
          description:
            typeof body.source.data.description === "string"
              ? body.source.data.description
              : undefined,
          content: String(body.source.data.content ?? ""),
          category:
            typeof body.source.data.category === "string"
              ? body.source.data.category
              : undefined,
          visibility:
            body.source.data.visibility === "project" ? "project" : "global",
          projectPath:
            typeof body.source.data.projectPath === "string"
              ? body.source.data.projectPath
              : undefined,
        };
      } else {
        return NextResponse.json(
          { error: "skill conversions require source.kind=skill|inline" },
          { status: 400 },
        );
      }

      if (!("name" in source) || !source.name || !source.content.trim()) {
        return NextResponse.json(
          { error: "skill name and content are required" },
          { status: 400 },
        );
      }

      let results = convertSkillTargets(source, targetProvider);
      if (mode === "save") {
        results = await saveConvertedResults({
          artifactType,
          baseSkill: source,
          overwrite,
          results,
        });
      }
      return NextResponse.json({
        artifactType,
        targetProvider,
        results,
        primary: results[0] ?? null,
      });
    }

    if (artifactType === "workflow") {
      let source: {
        provider?: "claude" | "codex" | "gemini";
        name: string;
        description: string;
        generatedPlan?: string;
        nodes: unknown[];
        edges: unknown[];
        cwd?: string;
        commandName?: string | null;
        commandDescription?: string | null;
        activationContext?: string | null;
        autoSkillEnabled?: boolean;
        projectId?: string;
        projectPath?: string;
        scopedAgents?: unknown[];
      };

      if (body.source.kind === "workflow") {
        const workflow = getWorkflow(body.source.id);
        if (!workflow) {
          return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
        }
        source = {
          provider: workflow.provider,
          name: workflow.name,
          description: workflow.description,
          generatedPlan: workflow.generatedPlan,
          nodes: workflow.nodes,
          edges: workflow.edges,
          cwd: workflow.cwd,
          commandName: workflow.commandName,
          commandDescription: workflow.commandDescription,
          activationContext: workflow.activationContext,
          autoSkillEnabled: workflow.autoSkillEnabled,
          projectId: workflow.projectId,
          projectPath: workflow.projectPath,
          scopedAgents: workflow.scopedAgents ?? [],
        };
      } else if (body.source.kind === "inline") {
        source = {
          provider:
            body.source.data.provider === "claude" ||
            body.source.data.provider === "codex" ||
            body.source.data.provider === "gemini"
              ? body.source.data.provider
              : undefined,
          name: String(body.source.data.name ?? "").trim(),
          description:
            typeof body.source.data.description === "string"
              ? body.source.data.description
              : "",
          generatedPlan:
            typeof body.source.data.generatedPlan === "string"
              ? body.source.data.generatedPlan
              : "",
          nodes: Array.isArray(body.source.data.nodes)
            ? body.source.data.nodes
            : [],
          edges: Array.isArray(body.source.data.edges)
            ? body.source.data.edges
            : [],
          cwd:
            typeof body.source.data.cwd === "string"
              ? body.source.data.cwd
              : "",
          commandName:
            typeof body.source.data.commandName === "string"
              ? body.source.data.commandName
              : null,
          commandDescription:
            typeof body.source.data.commandDescription === "string"
              ? body.source.data.commandDescription
              : null,
          activationContext:
            typeof body.source.data.activationContext === "string"
              ? body.source.data.activationContext
              : null,
          autoSkillEnabled:
            body.source.data.autoSkillEnabled === false ? false : true,
          projectId:
            typeof body.source.data.projectId === "string"
              ? body.source.data.projectId
              : undefined,
          projectPath:
            typeof body.source.data.projectPath === "string"
              ? body.source.data.projectPath
              : undefined,
          scopedAgents: Array.isArray(body.source.data.scopedAgents)
            ? body.source.data.scopedAgents
            : [],
        };
      } else {
        return NextResponse.json(
          { error: "workflow conversions require source.kind=workflow|inline" },
          { status: 400 },
        );
      }

      if (!source.name) {
        return NextResponse.json(
          { error: "workflow name is required" },
          { status: 400 },
        );
      }

      let results = convertWorkflowTargets(
        {
          provider: source.provider,
          name: source.name,
          description: source.description,
          generatedPlan: source.generatedPlan,
          nodes: source.nodes as WorkflowNode[],
          edges: source.edges as WorkflowEdge[],
          cwd: source.cwd,
          commandName: source.commandName,
          commandDescription: source.commandDescription,
          activationContext: source.activationContext,
          autoSkillEnabled: source.autoSkillEnabled,
          projectId: source.projectId,
          projectPath: source.projectPath,
          scopedAgents: source.scopedAgents as WorkflowScopedAgent[],
        },
        targetProvider,
      );

      if (mode === "save") {
        results = await saveConvertedResults({
          artifactType,
          overwrite,
          baseWorkflow: {
            provider: source.provider,
            name: source.name,
            description: source.description,
            generatedPlan: source.generatedPlan,
            nodes: source.nodes as WorkflowNode[],
            edges: source.edges as WorkflowEdge[],
            cwd: source.cwd,
            commandName: source.commandName,
            commandDescription: source.commandDescription,
            activationContext: source.activationContext,
            autoSkillEnabled: source.autoSkillEnabled,
            projectId: source.projectId,
            projectPath: source.projectPath,
            scopedAgents: source.scopedAgents as WorkflowScopedAgent[],
          },
          results,
        });
      }

      return NextResponse.json({
        artifactType,
        targetProvider,
        results,
        primary: results[0] ?? null,
      });
    }

    if (artifactType === "agent") {
      let source: {
        name: string;
        description: string;
        prompt: string;
        model?: string;
        effort?: "low" | "medium" | "high";
        tools?: string[];
        color?: string;
        category?: string;
        scope?: "global" | "project";
        projectPath?: string;
        areaPath?: string;
      };

      if (body.source.kind === "agent") {
        const srcProvider = body.source.provider ?? "claude";
        const { getProviderAgent } = await import(
          "@/lib/providers/agent-files"
        );
        const agent = getProviderAgent(
          srcProvider,
          body.source.name,
          body.source.projectPath,
        );
        if (!agent) {
          return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }
        source = {
          name: agent.name,
          description: agent.description,
          prompt: agent.prompt,
          model: agent.model,
          effort: agent.effort,
          tools: agent.tools,
          color: agent.color,
          category: agent.category,
          scope: body.source.projectPath ? "project" : "global",
          projectPath: body.source.projectPath,
          areaPath: agent.areaPath,
        };
      } else if (body.source.kind === "inline") {
        source = {
          name: String(body.source.data.name ?? "").trim(),
          description: String(body.source.data.description ?? "").trim(),
          prompt: String(body.source.data.prompt ?? ""),
          model:
            typeof body.source.data.model === "string"
              ? body.source.data.model
              : undefined,
          effort:
            body.source.data.effort === "low" ||
            body.source.data.effort === "medium" ||
            body.source.data.effort === "high"
              ? body.source.data.effort
              : undefined,
          tools: Array.isArray(body.source.data.tools)
            ? body.source.data.tools.filter(
                (t): t is string => typeof t === "string" && t.trim().length > 0,
              )
            : undefined,
          color:
            typeof body.source.data.color === "string"
              ? body.source.data.color
              : undefined,
          category:
            typeof body.source.data.category === "string"
              ? body.source.data.category
              : undefined,
          scope: body.source.data.scope === "project" ? "project" : "global",
          projectPath:
            typeof body.source.data.projectPath === "string"
              ? body.source.data.projectPath
              : undefined,
          areaPath:
            typeof body.source.data.areaPath === "string"
              ? body.source.data.areaPath
              : undefined,
        };
      } else {
        return NextResponse.json(
          { error: "agent conversions require source.kind=agent|inline" },
          { status: 400 },
        );
      }

      if (!source.name || !source.prompt.trim()) {
        return NextResponse.json(
          { error: "agent name and prompt are required" },
          { status: 400 },
        );
      }

      let results = convertAgentTargets(source, targetProvider);
      if (mode === "save") {
        results = await saveConvertedResults({
          artifactType,
          baseAgent: source,
          overwrite,
          results,
        });
      }
      return NextResponse.json({
        artifactType,
        targetProvider,
        results,
        primary: results[0] ?? null,
      });
    }

    // Hook conversion
    if (body.source.kind !== "inline") {
      return NextResponse.json(
        { error: "hook conversions require source.kind=inline" },
        { status: 400 },
      );
    }

    const event = String(body.source.data.event ?? "").trim();
    const hookData = body.source.data.hook as Record<string, unknown> | undefined;
    if (!event || !hookData || typeof hookData !== "object") {
      return NextResponse.json(
        { error: "hook conversion requires event and hook" },
        { status: 400 },
      );
    }
    const hookType = hookData.type;
    if (hookType !== "command" && hookType !== "prompt" && hookType !== "agent") {
      return NextResponse.json({ error: "invalid hook type" }, { status: 400 });
    }
    const results = convertHookTargets(
      {
        event,
        matcher:
          typeof body.source.data.matcher === "string"
            ? body.source.data.matcher
            : undefined,
        hook: {
          type: hookType,
          command:
            typeof hookData.command === "string" ? hookData.command : undefined,
          prompt: typeof hookData.prompt === "string" ? hookData.prompt : undefined,
          timeout:
            typeof hookData.timeout === "number" ? hookData.timeout : undefined,
          async: hookData.async === true,
        },
      },
      targetProvider,
    );
    if (mode === "save") {
      const savedResults = await saveConvertedResults({
        artifactType,
        source: {
          projectPath:
            typeof body.source.data.projectPath === "string"
              ? body.source.data.projectPath
              : undefined,
        },
        overwrite,
        results,
      });
      return NextResponse.json({
        artifactType,
        targetProvider,
        results: savedResults,
        primary: savedResults[0] ?? null,
      });
    }
    return NextResponse.json({
      artifactType,
      targetProvider,
      results,
      primary: results[0] ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Conversion request failed",
      },
      { status: 500 },
    );
  }
}
