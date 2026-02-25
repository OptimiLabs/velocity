import { getDb } from "./index";

type AnalysisConversationRow = {
  id: string;
  session_ids: string | null;
  enabled_session_ids: string | null;
};

function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function tableExists(tableName: string): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name?: string } | undefined;
  return row?.name === tableName;
}

export function deleteSessionsWithCleanup(sessionIds: string[]): {
  deletedSessions: number;
  detachedInstructionLinks: number;
  updatedAnalysisConversations: number;
  deletedAnalysisConversations: number;
} {
  const uniqueIds = Array.from(
    new Set(
      sessionIds
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  );
  if (uniqueIds.length === 0) {
    return {
      deletedSessions: 0,
      detachedInstructionLinks: 0,
      updatedAnalysisConversations: 0,
      deletedAnalysisConversations: 0,
    };
  }

  const db = getDb();
  const chunkSize = 900;
  const targetSet = new Set(uniqueIds);
  const hasSessionInstructionFiles = tableExists("session_instruction_files");
  const hasAnalysisConversations = tableExists("analysis_conversations");

  const tx = db.transaction((ids: string[]) => {
    let detachedInstructionLinks = 0;
    if (hasSessionInstructionFiles) {
      for (const chunk of chunked(ids, chunkSize)) {
        const placeholders = chunk.map(() => "?").join(",");
        const result = db
          .prepare(
            `DELETE FROM session_instruction_files WHERE session_id IN (${placeholders})`,
          )
          .run(...chunk);
        detachedInstructionLinks += result.changes;
      }
    }

    const conversations = hasAnalysisConversations
      ? (db
          .prepare(
            "SELECT id, session_ids, enabled_session_ids FROM analysis_conversations",
          )
          .all() as AnalysisConversationRow[])
      : [];

    const updateConversation = hasAnalysisConversations
      ? db.prepare(
          "UPDATE analysis_conversations SET session_ids = ?, enabled_session_ids = ?, updated_at = ? WHERE id = ?",
        )
      : null;
    const deleteConversation = hasAnalysisConversations
      ? db.prepare("DELETE FROM analysis_conversations WHERE id = ?")
      : null;

    let updatedAnalysisConversations = 0;
    let deletedAnalysisConversations = 0;
    const now = new Date().toISOString();

    for (const conversation of conversations) {
      const existingSessionIds = parseJsonStringArray(conversation.session_ids);
      const existingEnabledIds = parseJsonStringArray(
        conversation.enabled_session_ids,
      );
      const nextSessionIds = existingSessionIds.filter((id) => !targetSet.has(id));

      if (nextSessionIds.length === existingSessionIds.length) {
        continue;
      }

      if (nextSessionIds.length === 0) {
        deleteConversation?.run(conversation.id);
        deletedAnalysisConversations += 1;
        continue;
      }

      const remainingSet = new Set(nextSessionIds);
      const nextEnabledIds = existingEnabledIds.filter((id) =>
        remainingSet.has(id),
      );

      updateConversation?.run(
        JSON.stringify(nextSessionIds),
        JSON.stringify(nextEnabledIds),
        now,
        conversation.id,
      );
      updatedAnalysisConversations += 1;
    }

    let deletedSessions = 0;
    for (const chunk of chunked(ids, chunkSize)) {
      const placeholders = chunk.map(() => "?").join(",");
      const result = db
        .prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`)
        .run(...chunk);
      deletedSessions += result.changes;
    }

    return {
      deletedSessions,
      detachedInstructionLinks,
      updatedAnalysisConversations,
      deletedAnalysisConversations,
    };
  });

  return tx(uniqueIds);
}
