import type Database from "better-sqlite3";

let memoryInitialized = false;

/**
 * Lazily initialize memory management system tables.
 * Only call when memory features are first activated.
 */
export function initMemorySchema(db: Database.Database) {
  if (memoryInitialized) return;
  memoryInitialized = true;

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_plans (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planning',
      codebase_analysis TEXT,
      decomposition_strategy TEXT,
      total_estimated_tokens INTEGER DEFAULT 0,
      total_actual_tokens INTEGER DEFAULT 0,
      total_estimated_cost REAL DEFAULT 0,
      total_actual_cost REAL DEFAULT 0,
      token_savings INTEGER DEFAULT 0,
      savings_percentage REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      started_at TEXT,
      completed_at TEXT,
      metadata TEXT DEFAULT '{}',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS memory_tasks (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      role TEXT NOT NULL,
      priority INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      depends_on TEXT DEFAULT '[]',
      assigned_session_id TEXT,
      worktree_path TEXT,
      worktree_branch TEXT,
      context_budget_tokens INTEGER DEFAULT 50000,
      actual_input_tokens INTEGER DEFAULT 0,
      actual_output_tokens INTEGER DEFAULT 0,
      actual_cost REAL DEFAULT 0,
      result_summary TEXT,
      result_notes TEXT,
      files_modified TEXT DEFAULT '[]',
      files_created TEXT DEFAULT '[]',
      verification_status TEXT,
      verification_notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plan_id) REFERENCES memory_plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memory_context_chunks (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      chunk_type TEXT NOT NULL,
      symbol_name TEXT,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      token_count INTEGER NOT NULL,
      language TEXT,
      dependencies TEXT DEFAULT '[]',
      relevance_tags TEXT DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plan_id) REFERENCES memory_plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memory_task_context (
      task_id TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      relevance_score REAL DEFAULT 1.0,
      is_required INTEGER DEFAULT 1,
      token_count INTEGER DEFAULT 0,
      PRIMARY KEY (task_id, chunk_id),
      FOREIGN KEY (task_id) REFERENCES memory_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (chunk_id) REFERENCES memory_context_chunks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memory_agent_messages (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      from_task_id TEXT,
      to_task_id TEXT,
      from_role TEXT NOT NULL,
      to_role TEXT,
      message_type TEXT NOT NULL,
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      read_by TEXT DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plan_id) REFERENCES memory_plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memory_approvals (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      description TEXT NOT NULL,
      risk_level TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT,
      resolved_by TEXT,
      resolution_notes TEXT,
      FOREIGN KEY (plan_id) REFERENCES memory_plans(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES memory_tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memory_role_permissions (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      plan_id TEXT,
      allowed_paths TEXT DEFAULT '["**/*"]',
      writable_paths TEXT DEFAULT '["**/*"]',
      allowed_tools TEXT DEFAULT '["*"]',
      denied_tools TEXT DEFAULT '[]',
      max_tokens_per_task INTEGER DEFAULT 100000,
      max_cost_per_task REAL DEFAULT 2.00,
      FOREIGN KEY (plan_id) REFERENCES memory_plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memory_file_deps (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      source_file TEXT NOT NULL,
      target_file TEXT NOT NULL,
      dep_type TEXT NOT NULL,
      symbol_names TEXT DEFAULT '[]',
      FOREIGN KEY (plan_id) REFERENCES memory_plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memory_learnings (
      id TEXT PRIMARY KEY,
      plan_id TEXT,
      project_id TEXT,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      confidence REAL DEFAULT 0.8,
      applicable_roles TEXT DEFAULT '["*"]',
      times_applied INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plan_id) REFERENCES memory_plans(id) ON DELETE SET NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS memory_token_savings (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      naive_tokens INTEGER NOT NULL,
      actual_tokens INTEGER NOT NULL,
      savings_tokens INTEGER NOT NULL,
      savings_percentage REAL NOT NULL,
      naive_cost REAL NOT NULL,
      actual_cost REAL NOT NULL,
      savings_cost REAL NOT NULL,
      breakdown TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plan_id) REFERENCES memory_plans(id) ON DELETE CASCADE
    );

    -- Memory system indexes
    CREATE INDEX IF NOT EXISTS idx_memory_tasks_plan ON memory_tasks(plan_id);
    CREATE INDEX IF NOT EXISTS idx_memory_tasks_status ON memory_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_memory_tasks_role ON memory_tasks(role);
    CREATE INDEX IF NOT EXISTS idx_memory_chunks_plan ON memory_context_chunks(plan_id);
    CREATE INDEX IF NOT EXISTS idx_memory_chunks_file ON memory_context_chunks(file_path);
    CREATE INDEX IF NOT EXISTS idx_memory_chunks_hash ON memory_context_chunks(content_hash);
    CREATE INDEX IF NOT EXISTS idx_memory_messages_plan ON memory_agent_messages(plan_id);
    CREATE INDEX IF NOT EXISTS idx_memory_messages_to ON memory_agent_messages(to_task_id);
    CREATE INDEX IF NOT EXISTS idx_memory_approvals_status ON memory_approvals(status);
    CREATE INDEX IF NOT EXISTS idx_memory_permissions_role ON memory_role_permissions(role);
    CREATE INDEX IF NOT EXISTS idx_memory_deps_source ON memory_file_deps(source_file);
    CREATE INDEX IF NOT EXISTS idx_memory_deps_target ON memory_file_deps(target_file);
    CREATE INDEX IF NOT EXISTS idx_memory_learnings_category ON memory_learnings(category);
    CREATE INDEX IF NOT EXISTS idx_memory_learnings_project ON memory_learnings(project_id);
  `);
}
