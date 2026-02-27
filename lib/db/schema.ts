import type Database from "better-sqlite3";

/**
 * Initializes the database schema and runs pending migrations.
 *
 * - All `CREATE TABLE IF NOT EXISTS` statements are idempotent and safe to
 *   re-run on every startup (no-ops when the table already exists).
 * - Version-gated `ALTER TABLE` migrations only run when the stored version
 *   is below the migration's version number, preventing duplicate changes.
 * - The current schema version is persisted in the `index_metadata` table
 *   (key = 'schema_version') so upgrades are applied exactly once.
 */
export function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      session_count INTEGER DEFAULT 0,   -- denormalized count for fast dashboard display
      total_tokens INTEGER DEFAULT 0,    -- denormalized aggregate avoids COUNT on sessions
      total_cost REAL DEFAULT 0,         -- denormalized aggregate avoids SUM on sessions
      last_activity_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      slug TEXT,
      first_prompt TEXT,
      summary TEXT,
      message_count INTEGER DEFAULT 0,
      tool_call_count INTEGER DEFAULT 0,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      total_cost REAL DEFAULT 0,
      git_branch TEXT,
      project_path TEXT,
      created_at TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      jsonl_path TEXT NOT NULL,
      tool_usage TEXT DEFAULT '{}',      -- JSON map of tool name → call count
      model_usage TEXT DEFAULT '{}',     -- JSON map of model name → token counts
      enriched_tools TEXT DEFAULT '{}',  -- JSON map of tool name → categorized metadata
      session_role TEXT DEFAULT 'standalone', -- 'standalone' | 'subagent' (legacy values normalized on migration)
      tags TEXT DEFAULT '[]',            -- JSON array; SQLite lacks native arrays
      parent_session_id TEXT,
      subagent_type TEXT,
      billing_plan TEXT,
      compressed_at TEXT,
      effort_mode TEXT,
      avg_latency_ms REAL DEFAULT 0,
      p50_latency_ms REAL DEFAULT 0,
      p95_latency_ms REAL DEFAULT 0,
      max_latency_ms REAL DEFAULT 0,
      latency_sample_count INTEGER DEFAULT 0,
      session_duration_ms REAL DEFAULT 0,
      provider TEXT DEFAULT 'claude',
      pricing_status TEXT DEFAULT 'priced',
      unpriced_tokens INTEGER DEFAULT 0,
      unpriced_messages INTEGER DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_modified ON sessions(modified_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);
    -- Indexes for session_role/parent_session_id/effort_mode are created in
    -- guarded post-migration steps so older DBs without those columns can boot.

    CREATE TABLE IF NOT EXISTS prompt_snippets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      tags TEXT DEFAULT '[]',
      usage_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS console_sessions (
      id TEXT PRIMARY KEY,
      claude_session_id TEXT,            -- nullable: set once a Claude process attaches
      cwd TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT 'New Session',
      first_prompt TEXT,
      created_at INTEGER NOT NULL        -- Unix ms timestamp; INTEGER for efficient sorting/indexing in SQLite
    );

    CREATE TABLE IF NOT EXISTS index_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_prompt_snippets_category ON prompt_snippets(category);

    CREATE TABLE IF NOT EXISTS instruction_files (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL UNIQUE,
      file_type TEXT NOT NULL,
      project_path TEXT,
      project_id TEXT,
      file_name TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      content_hash TEXT,
      token_count INTEGER DEFAULT 0,
      is_editable INTEGER DEFAULT 1,      -- SQLite has no BOOLEAN; 0=false, 1=true
      last_indexed_at TEXT,
      file_mtime TEXT,
      source TEXT DEFAULT 'auto',
      tags TEXT DEFAULT '[]',
      category TEXT DEFAULT NULL,
      slug TEXT DEFAULT NULL,
      title TEXT DEFAULT NULL,
      description TEXT DEFAULT '',
      char_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      provider TEXT DEFAULT 'claude',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_instruction_files_project ON instruction_files(project_id);
    CREATE INDEX IF NOT EXISTS idx_instruction_files_type ON instruction_files(file_type);
    CREATE INDEX IF NOT EXISTS idx_instruction_files_provider ON instruction_files(provider);
    CREATE INDEX IF NOT EXISTS idx_instruction_files_scope_active
      ON instruction_files(provider, is_active, file_type, project_id, file_path);

    -- Junction table: links instruction files to agents/workflows by name
    CREATE TABLE IF NOT EXISTS instruction_attachments (
      instruction_id TEXT NOT NULL,
      target_type TEXT NOT NULL,          -- e.g. 'agent', 'workflow'
      target_name TEXT NOT NULL,          -- name of the target entity
      enabled INTEGER DEFAULT 1,
      priority INTEGER DEFAULT 0,         -- higher = injected first into context
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (instruction_id, target_type, target_name),
      FOREIGN KEY (instruction_id) REFERENCES instruction_files(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_provider_keys (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL UNIQUE,      -- canonical provider name (e.g. 'openai', 'anthropic')
      display_name TEXT NOT NULL,
      api_key_encrypted TEXT NOT NULL,    -- encrypted at rest via lib/ai encryption helpers
      model_id TEXT,
      endpoint_url TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );


    -- Audit log for AI-assisted edits to instruction files
    CREATE TABLE IF NOT EXISTS instruction_edit_history (
      id TEXT PRIMARY KEY,
      instruction_id TEXT NOT NULL,
      editor_type TEXT NOT NULL,
      prompt_used TEXT,
      content_before TEXT,
      content_after TEXT,
      tokens_used INTEGER DEFAULT 0,
      cost REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (instruction_id) REFERENCES instruction_files(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      generated_plan TEXT NOT NULL DEFAULT '',
      nodes TEXT NOT NULL DEFAULT '[]',    -- JSON: @xyflow/react Node[] for canvas positions
      edges TEXT NOT NULL DEFAULT '[]',   -- JSON: @xyflow/react Edge[] for canvas connections
      cwd TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      swarm_id TEXT,
      command_name TEXT,
      command_description TEXT,
      activation_context TEXT,
      auto_skill_enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
    CREATE INDEX IF NOT EXISTS idx_workflows_updated ON workflows(updated_at DESC);

    CREATE TABLE IF NOT EXISTS marketplace_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS session_instruction_files (
      session_id TEXT NOT NULL,
      instruction_id TEXT NOT NULL,
      detection_method TEXT NOT NULL,
      PRIMARY KEY (session_id, instruction_id),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (instruction_id) REFERENCES instruction_files(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sif_instruction ON session_instruction_files(instruction_id);
  `);

  // Schema version tracking — only run migrations for versions > stored version
  const CURRENT_SCHEMA_VERSION = 38;

  let storedVersion = 0;
  try {
    const row = db
      .prepare("SELECT value FROM index_metadata WHERE key = 'schema_version'")
      .get() as { value: string } | undefined;
    if (row) storedVersion = parseInt(row.value, 10) || 0;
  } catch {
    // index_metadata may not exist yet on first run — that's version 0
  }

  if (storedVersion < CURRENT_SCHEMA_VERSION) {
    // v1: Add analytics columns (tool/model usage, summary) and fix console_sessions nullable constraint
    if (storedVersion < 1) {
      const migrations = [
        "ALTER TABLE sessions ADD COLUMN tool_usage TEXT DEFAULT '{}'",
        "ALTER TABLE sessions ADD COLUMN model_usage TEXT DEFAULT '{}'",
        "ALTER TABLE sessions ADD COLUMN enriched_tools TEXT DEFAULT '{}'",
        "ALTER TABLE sessions ADD COLUMN summary TEXT",
        "ALTER TABLE sessions ADD COLUMN cache_write_tokens INTEGER DEFAULT 0",
        "ALTER TABLE sessions ADD COLUMN thinking_blocks INTEGER DEFAULT 0",
        "ALTER TABLE console_sessions ADD COLUMN first_prompt TEXT",
        "ALTER TABLE daily_stats ADD COLUMN cache_read_tokens INTEGER DEFAULT 0",
        "ALTER TABLE daily_stats ADD COLUMN cache_write_tokens INTEGER DEFAULT 0",
      ];

      // ALTER TABLE throws if column already exists — intentionally silent
      for (const sql of migrations) {
        try {
          db.exec(sql);
        } catch {
          /* Column already exists */
        }
      }

      // Migrate console_sessions: old schema had claude_session_id NOT NULL
      try {
        db.exec(
          `INSERT INTO console_sessions (id, cwd, label, created_at) VALUES ('__migration_test__', '.', 'test', 0)`,
        );
        db.exec(`DELETE FROM console_sessions WHERE id = '__migration_test__'`);
      } catch {
        db.exec(`ALTER TABLE console_sessions RENAME TO console_sessions_old`);
        db.exec(`
          CREATE TABLE console_sessions (
            id TEXT PRIMARY KEY,
            claude_session_id TEXT,
            cwd TEXT NOT NULL,
            label TEXT NOT NULL DEFAULT 'New Session',
            first_prompt TEXT,
            created_at INTEGER NOT NULL
          )
        `);
        db.exec(`
          INSERT INTO console_sessions (id, claude_session_id, cwd, label, created_at)
          SELECT id, claude_session_id, cwd, label, created_at FROM console_sessions_old
        `);
        db.exec(`DROP TABLE console_sessions_old`);
      }
    }

    // v2-v3: no schema changes (application-level only)

    // v4: Add performance indexes for sort-heavy dashboard and analytics queries
    if (storedVersion < 4) {
      const indexMigrations = [
        "CREATE INDEX IF NOT EXISTS idx_sessions_cost ON sessions(total_cost DESC)",
        "CREATE INDEX IF NOT EXISTS idx_sessions_messages ON sessions(message_count DESC)",
        "CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date)",
      ];
      for (const sql of indexMigrations) {
        try {
          db.exec(sql);
        } catch {
          /* index may already exist */
        }
      }
    }

    // v5: Add session_role and tags for session hierarchy classification
    if (storedVersion < 5) {
      const m = [
        "ALTER TABLE sessions ADD COLUMN session_role TEXT DEFAULT 'standalone'",
        "ALTER TABLE sessions ADD COLUMN tags TEXT DEFAULT '[]'",
      ];
      for (const sql of m) {
        try {
          db.exec(sql);
        } catch {}
      }
      try {
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_sessions_role ON sessions(session_role)",
        );
      } catch {}
    }

    // v6: Add parent_session_id and subagent_type for hierarchical session trees
    if (storedVersion < 6) {
      const m = [
        "ALTER TABLE sessions ADD COLUMN parent_session_id TEXT",
        "ALTER TABLE sessions ADD COLUMN subagent_type TEXT",
      ];
      for (const sql of m) {
        try {
          db.exec(sql);
        } catch {}
      }
      try {
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id)",
        );
      } catch {}
    }

    // v7: Create marketplace_sources table for user-defined plugin registries
    if (storedVersion < 7) {
      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS marketplace_sources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            source_type TEXT NOT NULL,
            config TEXT NOT NULL DEFAULT '{}',
            enabled INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);
      } catch {
        /* table may already exist */
      }
    }

    // v8: Merge knowledge_files into instruction_files (add category/slug/title columns, migrate rows, drop old table)
    if (storedVersion < 8) {
      const cols = [
        "ALTER TABLE instruction_files ADD COLUMN category TEXT DEFAULT NULL",
        "ALTER TABLE instruction_files ADD COLUMN slug TEXT DEFAULT NULL",
        "ALTER TABLE instruction_files ADD COLUMN title TEXT DEFAULT NULL",
        "ALTER TABLE instruction_files ADD COLUMN description TEXT DEFAULT ''",
        "ALTER TABLE instruction_files ADD COLUMN char_count INTEGER DEFAULT 0",
        "ALTER TABLE instruction_files ADD COLUMN is_active INTEGER DEFAULT 1",
      ];
      for (const sql of cols) {
        try {
          db.exec(sql);
        } catch {}
      }

      try {
        db.exec(`
          INSERT OR IGNORE INTO instruction_files
            (id, file_path, file_type, project_path, project_id, file_name, content, content_hash,
             token_count, is_editable, last_indexed_at, file_mtime, source, tags,
             category, slug, title, description, char_count, is_active,
             created_at, updated_at)
          SELECT
            id, file_path, 'knowledge.md', NULL, NULL,
            slug || '.md', content, content_hash, token_count,
            1, last_modified_at, last_modified_at, 'auto', tags,
            category, slug, title, description, char_count, is_active,
            created_at, updated_at
          FROM knowledge_files
          WHERE file_path NOT IN (SELECT file_path FROM instruction_files)
        `);
      } catch {}

      try {
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_instruction_files_category ON instruction_files(category)",
        );
      } catch {}
      try {
        db.exec("DROP TABLE IF EXISTS knowledge_files");
      } catch {}
    }

    // v9: Create marketplace_cache table for caching fetched plugin listings
    if (storedVersion < 9) {
      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS marketplace_cache (
            cache_key TEXT PRIMARY KEY,
            items TEXT NOT NULL DEFAULT '[]',
            fetched_at INTEGER NOT NULL
          )
        `);
      } catch {
        /* table may already exist */
      }
    }

    // v10: Create agent_catalog table for tracking installed agents and their enable/disable state
    if (storedVersion < 10) {
      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS agent_catalog (
            agent_name TEXT PRIMARY KEY,
            source TEXT NOT NULL DEFAULT 'custom',
            enabled INTEGER DEFAULT 1,
            source_url TEXT,
            source_version TEXT,
            installed_at INTEGER,
            skills TEXT DEFAULT '[]',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);
      } catch {
        /* table may already exist */
      }
    }

    // v11: Create session_instruction_files junction table linking sessions to their active instruction files
    if (storedVersion < 11) {
      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS session_instruction_files (
            session_id TEXT NOT NULL,
            instruction_id TEXT NOT NULL,
            detection_method TEXT NOT NULL,
            PRIMARY KEY (session_id, instruction_id),
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
            FOREIGN KEY (instruction_id) REFERENCES instruction_files(id) ON DELETE CASCADE
          )
        `);
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_sif_instruction ON session_instruction_files(instruction_id)",
        );
      } catch {
        /* table may already exist */
      }
    }

    // v12: Add manually_renamed flag to console_sessions so auto-naming skips user-renamed sessions
    if (storedVersion < 12) {
      try {
        db.exec(
          "ALTER TABLE console_sessions ADD COLUMN manually_renamed INTEGER DEFAULT 0",
        );
      } catch {
        /* column may already exist */
      }
    }

    // v13: Add command_name/description/activation_context to workflows for slash-command deployment
    if (storedVersion < 13) {
      const cols = [
        "ALTER TABLE workflows ADD COLUMN command_name TEXT",
        "ALTER TABLE workflows ADD COLUMN command_description TEXT",
        "ALTER TABLE workflows ADD COLUMN activation_context TEXT",
        "ALTER TABLE workflows ADD COLUMN auto_skill_enabled INTEGER DEFAULT 1",
      ];
      for (const sql of cols) {
        try {
          db.exec(sql);
        } catch {
          /* column may already exist */
        }
      }
    }

    // v14: Add index on sessions.project_path for fast codebase-scoped queries
    if (storedVersion < 14) {
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_sessions_project_path ON sessions(project_path)",
      );
    }

    // v15: Create analysis_conversations table for persistent AI analysis chat history
    if (storedVersion < 15) {
      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS analysis_conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT '',
            session_ids TEXT NOT NULL DEFAULT '[]',
            enabled_session_ids TEXT NOT NULL DEFAULT '[]',
            scope TEXT NOT NULL DEFAULT '{}',
            model TEXT NOT NULL DEFAULT 'claude-cli',
            messages TEXT NOT NULL DEFAULT '[]',
            total_cost REAL DEFAULT 0,
            total_tokens INTEGER DEFAULT 0,
            message_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_analysis_updated ON analysis_conversations(updated_at DESC)",
        );
      } catch {
        /* table may already exist */
      }
    }

    // v16: Add latency percentile columns (avg/p50/p95/max) and session_duration_ms to sessions
    if (storedVersion < 16) {
      const cols = [
        "ALTER TABLE sessions ADD COLUMN avg_latency_ms REAL DEFAULT 0",
        "ALTER TABLE sessions ADD COLUMN p50_latency_ms REAL DEFAULT 0",
        "ALTER TABLE sessions ADD COLUMN p95_latency_ms REAL DEFAULT 0",
        "ALTER TABLE sessions ADD COLUMN max_latency_ms REAL DEFAULT 0",
        "ALTER TABLE sessions ADD COLUMN session_duration_ms REAL DEFAULT 0",
      ];
      for (const sql of cols) {
        try {
          db.exec(sql);
        } catch {
          /* column may already exist */
        }
      }
    }

    // v17: Add project_id/project_path to agents and workflows; create project_plugin_overrides table
    if (storedVersion < 17) {
      const cols = [
        "ALTER TABLE agent_catalog ADD COLUMN project_id TEXT",
        "ALTER TABLE agent_catalog ADD COLUMN project_path TEXT",
        "ALTER TABLE workflows ADD COLUMN project_id TEXT",
        "ALTER TABLE workflows ADD COLUMN project_path TEXT",
      ];
      for (const sql of cols) {
        try {
          db.exec(sql);
        } catch {
          /* column may already exist */
        }
      }
      try {
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_agent_catalog_project ON agent_catalog(project_id)",
        );
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_workflows_project ON workflows(project_id)",
        );
      } catch {}

      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS project_plugin_overrides (
            project_id TEXT NOT NULL,
            plugin_id TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (project_id, plugin_id),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
          )
        `);
      } catch {
        /* table may already exist */
      }
    }

    // v18: Drop unused tables (daily_stats, agent_tools, etc.) and add composite/subagent indexes
    if (storedVersion < 18) {
      // Drop tables with zero rows and zero production code references
      db.exec("DROP TABLE IF EXISTS knowledge_files");
      db.exec("DROP TABLE IF EXISTS agent_tools");
      db.exec("DROP TABLE IF EXISTS agent_usage");
      db.exec("DROP TABLE IF EXISTS prompt_attachments");
      db.exec("DROP TABLE IF EXISTS daily_stats");

      // Add indexes for common query patterns
      try {
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_sessions_created_project ON sessions(created_at, project_id)",
        );
      } catch {}
      try {
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_sif_session ON session_instruction_files(session_id)",
        );
      } catch {}
      try {
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_sessions_subagent_type ON sessions(subagent_type)",
        );
      } catch {}
    }

    // v19: Add provider_slug to ai_provider_keys for multiple configs per provider (e.g. custom endpoints)
    if (storedVersion < 19) {
      try {
        db.exec(
          "ALTER TABLE ai_provider_keys ADD COLUMN provider_slug TEXT",
        );
      } catch {
        /* column may already exist */
      }
      // Backfill: set provider_slug = provider for existing rows
      try {
        db.exec(
          "UPDATE ai_provider_keys SET provider_slug = provider WHERE provider_slug IS NULL",
        );
      } catch {}
      // Replace old UNIQUE on provider with unique index on provider_slug
      // (allows multiple "custom" rows differentiated by slug)
      try {
        db.exec(
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_provider_slug ON ai_provider_keys(provider_slug)",
        );
      } catch {}
    }

    // v20: Add per-provider model parameters (temperature, top_k, top_p, thinking_budget, max_tokens)
    if (storedVersion < 20) {
      const cols = [
        "ALTER TABLE ai_provider_keys ADD COLUMN temperature REAL",
        "ALTER TABLE ai_provider_keys ADD COLUMN top_k INTEGER",
        "ALTER TABLE ai_provider_keys ADD COLUMN top_p REAL",
        "ALTER TABLE ai_provider_keys ADD COLUMN thinking_budget INTEGER",
        "ALTER TABLE ai_provider_keys ADD COLUMN max_tokens INTEGER",
      ];
      for (const sql of cols) {
        try {
          db.exec(sql);
        } catch {
          /* column may already exist */
        }
      }
    }

    // v21: Add archived_at, last_activity_at, archived_terminals to console_sessions for auto-archive
    if (storedVersion < 21) {
      const cols = [
        "ALTER TABLE console_sessions ADD COLUMN archived_at INTEGER",
        "ALTER TABLE console_sessions ADD COLUMN last_activity_at INTEGER",
        "ALTER TABLE console_sessions ADD COLUMN archived_terminals TEXT",
      ];
      for (const sql of cols) {
        try {
          db.exec(sql);
        } catch {
          /* column may already exist */
        }
      }
      try {
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_console_sessions_archived ON console_sessions(archived_at)",
        );
      } catch {}
      // Backfill last_activity_at from created_at for existing rows
      try {
        db.exec(
          "UPDATE console_sessions SET last_activity_at = created_at WHERE last_activity_at IS NULL",
        );
      } catch {}
    }

    // v22: Create routing_nodes and routing_edges tables for instruction-file routing graph (replaces JSON file)
    if (storedVersion < 22) {
      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS routing_nodes (
            id TEXT PRIMARY KEY,
            absolute_path TEXT NOT NULL,
            label TEXT NOT NULL,
            node_type TEXT NOT NULL,
            project_root TEXT,
            exists_on_disk INTEGER DEFAULT 1,
            position_x REAL,
            position_y REAL,
            file_size INTEGER,
            last_modified TEXT,
            scanned_at TEXT NOT NULL DEFAULT ''
          )
        `);
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_kn_type ON routing_nodes(node_type)",
        );
      } catch {
        /* table may already exist */
      }

      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS routing_edges (
            id TEXT PRIMARY KEY,
            source TEXT NOT NULL,
            target TEXT NOT NULL,
            context TEXT NOT NULL DEFAULT '',
            reference_type TEXT NOT NULL,
            is_manual INTEGER DEFAULT 0,
            scanned_at TEXT NOT NULL DEFAULT '',
            FOREIGN KEY (source) REFERENCES routing_nodes(id) ON DELETE CASCADE,
            FOREIGN KEY (target) REFERENCES routing_nodes(id) ON DELETE CASCADE
          )
        `);
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_ke_source ON routing_edges(source)",
        );
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_ke_target ON routing_edges(target)",
        );
      } catch {
        /* table may already exist */
      }
    }

    // v23: Create workflow_agents table for agents scoped to a specific workflow
    if (storedVersion < 23) {
      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS workflow_agents (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            model TEXT,
            effort TEXT,
            tools TEXT DEFAULT '[]',
            disallowed_tools TEXT DEFAULT '[]',
            color TEXT,
            icon TEXT,
            category TEXT,
            prompt TEXT NOT NULL DEFAULT '',
            skills TEXT DEFAULT '[]',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
            UNIQUE (workflow_id, name)
          )
        `);
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_wa_workflow ON workflow_agents(workflow_id)",
        );
      } catch {
        /* table may already exist */
      }
    }

    // v24: Rename knowledge_nodes/knowledge_edges tables to routing_nodes/routing_edges
    if (storedVersion < 24) {
      try {
        db.exec("ALTER TABLE knowledge_nodes RENAME TO routing_nodes");
      } catch {
        /* table may already be renamed or not exist */
      }
      try {
        db.exec("ALTER TABLE knowledge_edges RENAME TO routing_edges");
      } catch {
        /* table may already be renamed or not exist */
      }
      // Rename metadata keys
      try {
        db.exec(
          "UPDATE index_metadata SET key = 'routing_last_scanned_at' WHERE key = 'knowledge_last_scanned_at'",
        );
        db.exec(
          "UPDATE index_metadata SET key = 'routing_scan_duration_ms' WHERE key = 'knowledge_scan_duration_ms'",
        );
      } catch {}
    }

    // v25: Add billing_plan column to sessions for API vs Max subscription cost calculation
    if (storedVersion < 25) {
      try {
        db.exec("ALTER TABLE sessions ADD COLUMN billing_plan TEXT");
      } catch {
        /* column may already exist */
      }
      try {
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_sessions_billing_plan ON sessions(billing_plan)",
        );
      } catch {}
      // Backfill: stamp all existing sessions with the current plan from settings
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { readSettings } = require("../claude-settings");
        const settings = readSettings();
        const plan = settings.statuslinePlan ?? null;
        if (plan) {
          db.prepare(
            "UPDATE sessions SET billing_plan = ? WHERE billing_plan IS NULL",
          ).run(plan);
        }
      } catch {
        /* settings may not be readable — leave as NULL */
      }
    }

    if (storedVersion < 26) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS console_groups (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL DEFAULT 'Group',
          created_at INTEGER NOT NULL,
          last_activity_at INTEGER
        )
      `);
      try {
        db.exec("ALTER TABLE console_sessions ADD COLUMN group_id TEXT");
      } catch {
        /* column may already exist */
      }
    }

    // v27: Add agent_name to console_sessions for tracking which agent launched a session
    if (storedVersion < 27) {
      try {
        db.exec(
          "ALTER TABLE console_sessions ADD COLUMN agent_name TEXT",
        );
      } catch {
        /* column may already exist */
      }
    }

    // v28: Add provider column to workflows and agent_catalog for multi-provider support
    if (storedVersion < 28) {
      for (const sql of [
        "ALTER TABLE workflows ADD COLUMN provider TEXT DEFAULT 'claude'",
        "ALTER TABLE agent_catalog ADD COLUMN provider TEXT DEFAULT 'claude'",
      ]) {
        try {
          db.exec(sql);
        } catch {
          /* column may already exist */
        }
      }
    }

    // v29: Add provider column to sessions for multi-provider session tagging (Claude vs Codex)
    if (storedVersion < 29) {
      try {
        db.exec("ALTER TABLE sessions ADD COLUMN provider TEXT DEFAULT 'claude'");
      } catch {
        /* column may already exist */
      }
      try {
        db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider)");
      } catch {}
    }

    // v30: Add provider column to instruction_files and routing_nodes for provider-scoped routing
    if (storedVersion < 30) {
      try {
        db.exec(
          "ALTER TABLE instruction_files ADD COLUMN provider TEXT DEFAULT 'claude'",
        );
      } catch {
        /* column may already exist */
      }
      try {
        db.exec(
          "ALTER TABLE routing_nodes ADD COLUMN provider TEXT DEFAULT 'claude'",
        );
      } catch {
        /* column may already exist */
      }
      try {
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_instruction_files_provider ON instruction_files(provider)",
        );
      } catch {}
      try {
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_routing_nodes_provider ON routing_nodes(provider)",
        );
      } catch {}
    }

    // v31: Remove legacy 'orchestrator' session role values (collapse to standalone)
    if (storedVersion < 31) {
      try {
        db.exec(
          "UPDATE sessions SET session_role = 'standalone' WHERE session_role = 'orchestrator'",
        );
      } catch {
        /* sessions table may not exist yet */
      }
    }

    // v32: Add compressed_at for reversible session compression/archive
    if (storedVersion < 32) {
      try {
        db.exec("ALTER TABLE sessions ADD COLUMN compressed_at TEXT");
      } catch {
        /* column may already exist */
      }
      try {
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_sessions_compressed_at ON sessions(compressed_at)",
        );
      } catch {}
    }

    // v33: Add effort_mode for captured reasoning-effort/session mode (e.g. xhigh)
    if (storedVersion < 33) {
      try {
        db.exec("ALTER TABLE sessions ADD COLUMN effort_mode TEXT");
      } catch {
        /* column may already exist */
      }
      try {
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_sessions_effort_mode ON sessions(effort_mode)",
        );
      } catch {}
    }

    // v34: Add pricing status and latency sample count columns for strict cost audits
    if (storedVersion < 34) {
      const cols = [
        "ALTER TABLE sessions ADD COLUMN latency_sample_count INTEGER DEFAULT 0",
        "ALTER TABLE sessions ADD COLUMN pricing_status TEXT DEFAULT 'priced'",
        "ALTER TABLE sessions ADD COLUMN unpriced_tokens INTEGER DEFAULT 0",
        "ALTER TABLE sessions ADD COLUMN unpriced_messages INTEGER DEFAULT 0",
      ];
      for (const sql of cols) {
        try {
          db.exec(sql);
        } catch {
          /* column may already exist */
        }
      }
      try {
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_sessions_pricing_status ON sessions(pricing_status)",
        );
      } catch {}
    }

    // v35: Ensure commonly sorted/filterable session columns are indexed.
    if (storedVersion < 35) {
      const idx = [
        "CREATE INDEX IF NOT EXISTS idx_sessions_cost ON sessions(total_cost DESC)",
        "CREATE INDEX IF NOT EXISTS idx_sessions_messages ON sessions(message_count DESC)",
        "CREATE INDEX IF NOT EXISTS idx_sessions_project_path ON sessions(project_path)",
      ];
      for (const sql of idx) {
        try {
          db.exec(sql);
        } catch {
          /* index may already exist or column may be unavailable in legacy schemas */
        }
      }
    }

    // v36: Add targeted session-list/query-path indexes for large datasets.
    if (storedVersion < 36) {
      const idx = [
        // Fast default Sessions list (active sessions only, newest first)
        "CREATE INDEX IF NOT EXISTS idx_sessions_active_modified ON sessions(modified_at DESC) WHERE message_count > 0 AND compressed_at IS NULL",
        // Fast date-sorted active lists and windowed scans
        "CREATE INDEX IF NOT EXISTS idx_sessions_active_created ON sessions(created_at DESC) WHERE message_count > 0 AND compressed_at IS NULL",
        // Fast child session expansion in task/detail views
        "CREATE INDEX IF NOT EXISTS idx_sessions_parent_created ON sessions(parent_session_id, created_at ASC)",
      ];
      for (const sql of idx) {
        try {
          db.exec(sql);
        } catch {
          /* index may already exist or partial-index expression may be unsupported */
        }
      }
    }

    // v37: Backfill instruction-file providers and add context-scope lookup index.
    if (storedVersion < 37) {
      try {
        db.exec(
          "UPDATE instruction_files SET provider = 'claude' WHERE provider IS NULL OR TRIM(provider) = ''",
        );
      } catch {
        /* instruction_files/provider may be unavailable in partial legacy schemas */
      }
      try {
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_instruction_files_scope_active ON instruction_files(provider, is_active, file_type, project_id, file_path)",
        );
      } catch {}
    }

    // v38: Add provider-scoped session list indexes used by session/analytics APIs.
    if (storedVersion < 38) {
      const idx = [
        "CREATE INDEX IF NOT EXISTS idx_sessions_provider_modified ON sessions(provider, modified_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_sessions_provider_created ON sessions(provider, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_sessions_provider_project_path ON sessions(provider, project_path)",
      ];
      for (const sql of idx) {
        try {
          db.exec(sql);
        } catch {
          /* index may already exist */
        }
      }
    }

    // Store current version
    db.prepare(
      "INSERT OR REPLACE INTO index_metadata (key, value) VALUES ('schema_version', ?)",
    ).run(String(CURRENT_SCHEMA_VERSION));
  }

  // Safety net: ensure instruction_files columns exist regardless of migration state.
  // Migrations use try/catch that can silently fail, leaving columns missing.
  const requiredCols: [string, string][] = [
    ["category", "TEXT DEFAULT NULL"],
    ["slug", "TEXT DEFAULT NULL"],
    ["title", "TEXT DEFAULT NULL"],
    ["description", "TEXT DEFAULT ''"],
    ["char_count", "INTEGER DEFAULT 0"],
    ["is_active", "INTEGER DEFAULT 1"],
  ];
  for (const [col, def] of requiredCols) {
    try {
      db.exec(`ALTER TABLE instruction_files ADD COLUMN ${col} ${def}`);
    } catch {
      // Column already exists — expected
    }
  }

  // Safety net: ensure console_sessions columns exist regardless of migration state.
  // If schema_version was already >= 21 before the archived_at migration was added,
  // the ALTER TABLE in migration 21 would be skipped.
  const consoleSessionCols: [string, string][] = [
    ["manually_renamed", "INTEGER DEFAULT 0"],
    ["archived_at", "INTEGER"],
    ["last_activity_at", "INTEGER"],
    ["archived_terminals", "TEXT"],
    ["agent_name", "TEXT"],
  ];
  for (const [col, def] of consoleSessionCols) {
    try {
      db.exec(`ALTER TABLE console_sessions ADD COLUMN ${col} ${def}`);
    } catch {
      // Column already exists — expected
    }
  }
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_console_sessions_archived ON console_sessions(archived_at)",
    );
  } catch {}

  // Safety net: ensure analysis_conversations table exists regardless of migration state
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS analysis_conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        session_ids TEXT NOT NULL DEFAULT '[]',
        enabled_session_ids TEXT NOT NULL DEFAULT '[]',
        scope TEXT NOT NULL DEFAULT '{}',
        model TEXT NOT NULL DEFAULT 'claude-cli',
        messages TEXT NOT NULL DEFAULT '[]',
        total_cost REAL DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        message_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_analysis_updated ON analysis_conversations(updated_at DESC)",
    );
  } catch {
    // table already exists
  }

  // Safety net: ensure provider columns exist on all provider-aware tables.
  // The v29/v30 migrations wrap ALTER TABLE in try/catch but stamp schema_version
  // unconditionally, so if the ALTER fails for any reason other than "column already
  // exists", the column is never added and the migration never retries.
  for (const table of ["sessions", "routing_nodes", "instruction_files"]) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN provider TEXT DEFAULT 'claude'`);
    } catch {
      // Column already exists — expected
    }
  }
  // Safety net: ensure hierarchy/session-classification columns exist on sessions.
  // Older/partially-migrated DBs can miss these columns if a prior migration
  // failed but schema_version still advanced.
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN session_role TEXT DEFAULT 'standalone'");
  } catch {
    // Column already exists — expected
  }
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN parent_session_id TEXT");
  } catch {
    // Column already exists — expected
  }
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN subagent_type TEXT");
  } catch {
    // Column already exists — expected
  }
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider)");
  } catch {}
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_role ON sessions(session_role)");
  } catch {}
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id)");
  } catch {}
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_instruction_files_provider ON instruction_files(provider)");
  } catch {}
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_instruction_files_scope_active ON instruction_files(provider, is_active, file_type, project_id, file_path)",
    );
  } catch {}
  try {
    db.exec(
      "UPDATE instruction_files SET provider = 'claude' WHERE provider IS NULL OR TRIM(provider) = ''",
    );
  } catch {}
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_routing_nodes_provider ON routing_nodes(provider)");
  } catch {}
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN compressed_at TEXT");
  } catch {
    // Column already exists — expected
  }
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_sessions_compressed_at ON sessions(compressed_at)",
    );
  } catch {}
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN effort_mode TEXT");
  } catch {
    // Column already exists — expected
  }
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_sessions_effort_mode ON sessions(effort_mode)",
    );
  } catch {}
  try {
    db.exec(
      "ALTER TABLE sessions ADD COLUMN latency_sample_count INTEGER DEFAULT 0",
    );
  } catch {
    // Column already exists — expected
  }
  try {
    db.exec(
      "ALTER TABLE sessions ADD COLUMN pricing_status TEXT DEFAULT 'priced'",
    );
  } catch {
    // Column already exists — expected
  }
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN unpriced_tokens INTEGER DEFAULT 0");
  } catch {
    // Column already exists — expected
  }
  try {
    db.exec(
      "ALTER TABLE sessions ADD COLUMN unpriced_messages INTEGER DEFAULT 0",
    );
  } catch {
    // Column already exists — expected
  }
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_sessions_pricing_status ON sessions(pricing_status)",
    );
  } catch {}
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_sessions_cost ON sessions(total_cost DESC)",
    );
  } catch {}
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_sessions_messages ON sessions(message_count DESC)",
    );
  } catch {}
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_sessions_project_path ON sessions(project_path)",
    );
  } catch {}
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_sessions_active_modified ON sessions(modified_at DESC) WHERE message_count > 0 AND compressed_at IS NULL",
    );
  } catch {}
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_sessions_active_created ON sessions(created_at DESC) WHERE message_count > 0 AND compressed_at IS NULL",
    );
  } catch {}
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_sessions_parent_created ON sessions(parent_session_id, created_at ASC)",
    );
  } catch {}
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_sessions_provider_modified ON sessions(provider, modified_at DESC)",
    );
  } catch {}
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_sessions_provider_created ON sessions(provider, created_at DESC)",
    );
  } catch {}
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_sessions_provider_project_path ON sessions(provider, project_path)",
    );
  } catch {}
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path)");
  } catch {}
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_projects_last_activity ON projects(last_activity_at DESC)",
    );
  } catch {}
}
