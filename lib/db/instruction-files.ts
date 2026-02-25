import fs from "fs";
import { createHash } from "crypto";
import { getDb } from "./index";
import type {
  InstructionFile,
  InstructionAttachment,
  AIProvider,
  InstructionFileType,
  AttachmentTargetType,
  AIProviderType,
  ProviderSlug,
} from "@/types/instructions";

export interface ActiveAIProviderRuntimeConfig {
  provider: AIProviderType;
  providerSlug: ProviderSlug | null;
  displayName: string;
  apiKey: string;
  modelId: string | null;
  endpointUrl: string | null;
  temperature: number | null;
  topK: number | null;
  topP: number | null;
  thinkingBudget: number | null;
  maxTokens: number | null;
  updatedAt: string;
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// --- Instruction Files ---

export function listInstructionFiles(filters?: {
  projectId?: string;
  fileType?: InstructionFileType;
  search?: string;
  category?: string;
}): InstructionFile[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.projectId) {
    conditions.push("project_id = ?");
    params.push(filters.projectId);
  }
  if (filters?.fileType) {
    conditions.push("file_type = ?");
    params.push(filters.fileType);
  }
  if (filters?.category) {
    conditions.push("category = ?");
    params.push(filters.category);
  }
  if (filters?.search) {
    conditions.push("(file_name LIKE ? OR content LIKE ? OR file_path LIKE ?)");
    const term = `%${filters.search}%`;
    params.push(term, term, term);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM instruction_files ${where} ORDER BY updated_at DESC`;
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(rowToInstructionFile);
}

export function getInstructionFile(id: string): InstructionFile | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM instruction_files WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToInstructionFile(row) : null;
}

export function updateInstructionFile(
  id: string,
  data: {
    content?: string;
    tags?: string[];
    isActive?: boolean;
    description?: string;
  },
): InstructionFile | null {
  const db = getDb();
  const existing = getInstructionFile(id);
  if (!existing) return null;

  const now = new Date().toISOString();

  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  // Track content-derived values for the return object
  let contentHash = existing.contentHash;
  let tokenCount = existing.tokenCount;
  let charCount = existing.charCount;
  let title = existing.title;
  const contentUpdated = data.content !== undefined && existing.isEditable;

  if (contentUpdated) {
    // Write content back to filesystem
    try {
      fs.writeFileSync(existing.filePath, data.content!, "utf-8");
    } catch {
      throw new Error(`Cannot write to file: ${existing.filePath}`);
    }

    contentHash = createHash("sha256").update(data.content!).digest("hex");
    tokenCount = Math.ceil(data.content!.length / 4);
    charCount = data.content!.length;

    // Extract title from first heading for knowledge files
    if (existing.fileType === "knowledge.md") {
      const titleMatch = data.content!.match(/^#\s+(.+)$/m);
      if (titleMatch) title = titleMatch[1].trim();
    }

    sets.push("content = ?", "content_hash = ?", "token_count = ?", "char_count = ?", "title = ?");
    params.push(data.content!, contentHash, tokenCount, charCount, title);
  }

  if (data.tags !== undefined) {
    sets.push("tags = ?");
    params.push(JSON.stringify(data.tags));
  }

  if (data.isActive !== undefined) {
    sets.push("is_active = ?");
    params.push(data.isActive ? 1 : 0);
  }

  if (data.description !== undefined) {
    sets.push("description = ?");
    params.push(data.description);
  }

  params.push(id);
  db.prepare(
    `UPDATE instruction_files SET ${sets.join(", ")} WHERE id = ?`,
  ).run(...params);

  // Return updated fields directly instead of re-fetching
  return {
    ...existing,
    ...(contentUpdated && { content: data.content! }),
    contentHash,
    tokenCount,
    charCount,
    title,
    ...(data.tags !== undefined && { tags: data.tags }),
    ...(data.isActive !== undefined && { isActive: data.isActive }),
    ...(data.description !== undefined && { description: data.description }),
    updatedAt: now,
  };
}

export function deleteInstructionFile(id: string): boolean {
  const db = getDb();
  const tx = db.transaction((instructionId: string) => {
    // Keep junction cleanup explicit even when FK cascades are unavailable.
    db.prepare(
      "DELETE FROM instruction_attachments WHERE instruction_id = ?",
    ).run(instructionId);
    db.prepare(
      "DELETE FROM session_instruction_files WHERE instruction_id = ?",
    ).run(instructionId);
    const result = db
      .prepare("DELETE FROM instruction_files WHERE id = ?")
      .run(instructionId);
    return result.changes > 0;
  });
  return tx(id);
}

// --- Instruction Attachments ---

export function getAttachmentsForTarget(
  targetType: AttachmentTargetType,
  targetName: string,
): (InstructionAttachment & { file: InstructionFile })[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
    SELECT ia.*, inf.id as f_id, inf.file_path, inf.file_type, inf.project_path, inf.project_id,
           inf.file_name, inf.content, inf.content_hash, inf.token_count, inf.is_editable,
           inf.last_indexed_at, inf.file_mtime, inf.source, inf.tags as f_tags,
           inf.created_at as f_created_at, inf.updated_at as f_updated_at,
           inf.category, inf.slug, inf.title, inf.description, inf.char_count, inf.is_active
    FROM instruction_attachments ia
    JOIN instruction_files inf ON ia.instruction_id = inf.id
    WHERE ia.target_type = ? AND ia.target_name = ?
    ORDER BY ia.priority ASC
  `,
    )
    .all(targetType, targetName) as Record<string, unknown>[];

  return rows.map((row) => ({
    instructionId: row.instruction_id as string,
    targetType: row.target_type as AttachmentTargetType,
    targetName: row.target_name as string,
    enabled: row.enabled === 1,
    priority: row.priority as number,
    createdAt: row.created_at as string,
    file: {
      id: row.f_id as string,
      filePath: row.file_path as string,
      fileType: row.file_type as InstructionFileType,
      projectPath: row.project_path as string | null,
      projectId: row.project_id as string | null,
      fileName: row.file_name as string,
      content: row.content as string,
      contentHash: row.content_hash as string | null,
      tokenCount: row.token_count as number,
      isEditable: row.is_editable === 1,
      lastIndexedAt: row.last_indexed_at as string | null,
      fileMtime: row.file_mtime as string | null,
      source: row.source as InstructionFile["source"],
      tags: (() => { try { return JSON.parse((row.f_tags as string) || "[]"); } catch { return []; } })(),
      createdAt: row.f_created_at as string,
      updatedAt: row.f_updated_at as string,
      category: (row.category as string) || null,
      slug: (row.slug as string) || null,
      title: (row.title as string) || null,
      description: (row.description as string) || "",
      charCount: (row.char_count as number) || 0,
      isActive: row.is_active !== 0,
    },
  }));
}

export function getAttachmentsForInstruction(
  instructionId: string,
): InstructionAttachment[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM instruction_attachments WHERE instruction_id = ? ORDER BY priority ASC",
    )
    .all(instructionId) as Record<string, unknown>[];
  return rows.map(rowToAttachment);
}

export function attachInstruction(data: {
  instructionId: string;
  targetType: AttachmentTargetType;
  targetName: string;
  priority?: number;
}): void {
  const db = getDb();
  db.prepare(
    `
    INSERT OR REPLACE INTO instruction_attachments (instruction_id, target_type, target_name, enabled, priority, created_at)
    VALUES (?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
  `,
  ).run(
    data.instructionId,
    data.targetType,
    data.targetName,
    data.priority ?? 0,
  );
}

export function detachInstruction(
  instructionId: string,
  targetType: string,
  targetName: string,
): boolean {
  const db = getDb();
  const result = db
    .prepare(
      "DELETE FROM instruction_attachments WHERE instruction_id = ? AND target_type = ? AND target_name = ?",
    )
    .run(instructionId, targetType, targetName);
  return result.changes > 0;
}

export function detachAttachmentsForTarget(
  targetType: AttachmentTargetType,
  targetName: string,
): number {
  const db = getDb();
  const result = db
    .prepare(
      "DELETE FROM instruction_attachments WHERE target_type = ? AND target_name = ?",
    )
    .run(targetType, targetName);
  return result.changes;
}

export function toggleAttachment(
  instructionId: string,
  targetType: string,
  targetName: string,
  enabled: boolean,
): void {
  const db = getDb();
  db.prepare(
    "UPDATE instruction_attachments SET enabled = ? WHERE instruction_id = ? AND target_type = ? AND target_name = ?",
  ).run(enabled ? 1 : 0, instructionId, targetType, targetName);
}

// --- AI Provider Keys ---

export function listAIProviders(): Omit<AIProvider, "apiKeyEncrypted">[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, provider, provider_slug, display_name, model_id, endpoint_url, is_active, temperature, top_k, top_p, thinking_budget, max_tokens, created_at, updated_at FROM ai_provider_keys ORDER BY created_at DESC",
    )
    .all() as Record<string, unknown>[];
  return rows.map((row) => ({
    id: row.id as string,
    provider: row.provider as AIProviderType,
    providerSlug: (row.provider_slug as ProviderSlug) ?? null,
    displayName: row.display_name as string,
    modelId: row.model_id as string | null,
    endpointUrl: row.endpoint_url as string | null,
    isActive: row.is_active === 1,
    temperature: row.temperature as number | null,
    topK: row.top_k as number | null,
    topP: row.top_p as number | null,
    thinkingBudget: row.thinking_budget as number | null,
    maxTokens: row.max_tokens as number | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

export function getAIProviderKey(provider: AIProviderType): string | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT api_key_encrypted FROM ai_provider_keys WHERE provider = ? AND is_active = 1",
    )
    .get(provider) as { api_key_encrypted: string } | undefined;
  if (!row) return null;
  // Decode base64
  return Buffer.from(row.api_key_encrypted, "base64").toString("utf-8");
}

export function listActiveAIProviderConfigs(): ActiveAIProviderRuntimeConfig[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT provider, provider_slug, display_name, api_key_encrypted, model_id, endpoint_url,
              temperature, top_k, top_p, thinking_budget, max_tokens, updated_at
       FROM ai_provider_keys
       WHERE is_active = 1
       ORDER BY updated_at DESC, created_at DESC`,
    )
    .all() as Array<{
    provider: AIProviderType;
    provider_slug: ProviderSlug | null;
    display_name: string;
    api_key_encrypted: string;
    model_id: string | null;
    endpoint_url: string | null;
    temperature: number | null;
    top_k: number | null;
    top_p: number | null;
    thinking_budget: number | null;
    max_tokens: number | null;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    provider: row.provider,
    providerSlug: row.provider_slug,
    displayName: row.display_name,
    apiKey: Buffer.from(row.api_key_encrypted, "base64").toString("utf-8"),
    modelId: row.model_id,
    endpointUrl: row.endpoint_url,
    temperature: row.temperature,
    topK: row.top_k,
    topP: row.top_p,
    thinkingBudget: row.thinking_budget,
    maxTokens: row.max_tokens,
    updatedAt: row.updated_at,
  }));
}

export function saveAIProviderKey(data: {
  provider: AIProviderType;
  providerSlug?: ProviderSlug;
  displayName: string;
  apiKey: string;
  modelId?: string;
  endpointUrl?: string;
  temperature?: number | null;
  topK?: number | null;
  topP?: number | null;
  thinkingBudget?: number | null;
  maxTokens?: number | null;
}): void {
  const db = getDb();
  const now = new Date().toISOString();
  const encrypted = Buffer.from(data.apiKey).toString("base64");
  const slug = data.providerSlug ?? data.provider;

  // Upsert by provider_slug so we update an existing row for the same slug
  const existing = db
    .prepare("SELECT id FROM ai_provider_keys WHERE provider_slug = ?")
    .get(slug) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE ai_provider_keys
       SET provider = ?, display_name = ?, api_key_encrypted = ?, model_id = ?, endpoint_url = ?,
           temperature = ?, top_k = ?, top_p = ?, thinking_budget = ?, max_tokens = ?,
           is_active = 1, updated_at = ?
       WHERE provider_slug = ?`,
    ).run(
      data.provider,
      data.displayName,
      encrypted,
      data.modelId || null,
      data.endpointUrl || null,
      data.temperature ?? null,
      data.topK ?? null,
      data.topP ?? null,
      data.thinkingBudget ?? null,
      data.maxTokens ?? null,
      now,
      slug,
    );
  } else {
    const id = generateId("apk");
    db.prepare(
      `INSERT INTO ai_provider_keys (id, provider, provider_slug, display_name, api_key_encrypted, model_id, endpoint_url, temperature, top_k, top_p, thinking_budget, max_tokens, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(
      id,
      data.provider,
      slug,
      data.displayName,
      encrypted,
      data.modelId || null,
      data.endpointUrl || null,
      data.temperature ?? null,
      data.topK ?? null,
      data.topP ?? null,
      data.thinkingBudget ?? null,
      data.maxTokens ?? null,
      now,
      now,
    );
  }
}

export function updateProviderConfig(
  providerSlug: string,
  config: {
    temperature?: number | null;
    topK?: number | null;
    topP?: number | null;
    thinkingBudget?: number | null;
    maxTokens?: number | null;
  },
): boolean {
  const db = getDb();
  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if ("temperature" in config) {
    sets.push("temperature = ?");
    params.push(config.temperature ?? null);
  }
  if ("topK" in config) {
    sets.push("top_k = ?");
    params.push(config.topK ?? null);
  }
  if ("topP" in config) {
    sets.push("top_p = ?");
    params.push(config.topP ?? null);
  }
  if ("thinkingBudget" in config) {
    sets.push("thinking_budget = ?");
    params.push(config.thinkingBudget ?? null);
  }
  if ("maxTokens" in config) {
    sets.push("max_tokens = ?");
    params.push(config.maxTokens ?? null);
  }

  params.push(providerSlug);
  const result = db
    .prepare(
      `UPDATE ai_provider_keys SET ${sets.join(", ")} WHERE provider_slug = ?`,
    )
    .run(...params);
  return result.changes > 0;
}

export function deleteAIProviderKey(provider: string): boolean {
  const db = getDb();
  // Try by provider_slug first (new path), fall back to provider column (legacy)
  let result = db
    .prepare("DELETE FROM ai_provider_keys WHERE provider_slug = ?")
    .run(provider);
  if (result.changes === 0) {
    result = db
      .prepare("DELETE FROM ai_provider_keys WHERE provider = ?")
      .run(provider);
  }
  return result.changes > 0;
}

// --- Edit History ---

export function recordEdit(data: {
  instructionId: string;
  editorType: string;
  promptUsed?: string;
  contentBefore: string;
  contentAfter: string;
  tokensUsed?: number;
  cost?: number;
}): void {
  const db = getDb();
  const id = generateId("eh");
  db.prepare(
    `
    INSERT INTO instruction_edit_history (id, instruction_id, editor_type, prompt_used, content_before, content_after, tokens_used, cost, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `,
  ).run(
    id,
    data.instructionId,
    data.editorType,
    data.promptUsed || null,
    data.contentBefore,
    data.contentAfter,
    data.tokensUsed || 0,
    data.cost || 0,
  );
}

// --- Row Mappers ---

function rowToInstructionFile(row: Record<string, unknown>): InstructionFile {
  return {
    id: row.id as string,
    filePath: row.file_path as string,
    fileType: row.file_type as InstructionFileType,
    projectPath: row.project_path as string | null,
    projectId: row.project_id as string | null,
    fileName: row.file_name as string,
    content: row.content as string,
    contentHash: row.content_hash as string | null,
    tokenCount: row.token_count as number,
    isEditable: row.is_editable === 1,
    lastIndexedAt: row.last_indexed_at as string | null,
    fileMtime: row.file_mtime as string | null,
    source: row.source as InstructionFile["source"],
    tags: (() => { try { return JSON.parse((row.tags as string) || "[]"); } catch { return []; } })(),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    category: (row.category as string) || null,
    slug: (row.slug as string) || null,
    title: (row.title as string) || null,
    description: (row.description as string) || "",
    charCount: (row.char_count as number) || 0,
    isActive: row.is_active !== 0,
  };
}

function rowToAttachment(row: Record<string, unknown>): InstructionAttachment {
  return {
    instructionId: row.instruction_id as string,
    targetType: row.target_type as AttachmentTargetType,
    targetName: row.target_name as string,
    enabled: row.enabled === 1,
    priority: row.priority as number,
    createdAt: row.created_at as string,
  };
}
