# Configuration Guide

## Environment Variables

All environment variables are optional. Velocity works out of the box with sensible defaults.

### `GITHUB_TOKEN`

A GitHub personal access token for the Marketplace feature. Without it, GitHub API requests are limited to 60/hour. With a token, the limit is 5,000/hour.

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

Generate a token at [https://github.com/settings/tokens](https://github.com/settings/tokens). The token needs no special scopes -- public repository access is sufficient.

### `PORT`

The port for the Next.js development server. Defaults to `3000`.

```bash
PORT=3002 bun run dev
```

### `WS_PORT`

The port for the WebSocket server used by the Console feature. Defaults to `3001`.

## Claude Code Settings Integration

Velocity reads and writes Claude Code's configuration files to integrate with your existing setup.

### Settings file location

Claude Code stores settings in `~/.claude/settings.json`. Velocity reads this file to:

- Discover configured MCP servers
- Read hook configurations
- Access model preferences

When you install a marketplace package or apply a generated hook, Velocity writes back to this file.

### Session logs

Claude Code writes JSONL session logs to `~/.claude/projects/<project-path>/`. Velocity's file watcher monitors these directories to:

- Index new sessions for Analytics
- Compute cost and token usage
- Track tool call frequency

No configuration is needed -- Velocity auto-discovers all project directories under `~/.claude/`.

## Custom Hook Configuration

Hooks are event-driven scripts configured in Claude Code's `settings.json` under the `hooks` key. Velocity provides two ways to manage them:

### Via the Hooks page

1. Navigate to the Hooks page
2. Use the AI generator to describe desired behavior
3. Review and apply the generated configuration

### Manual configuration

Edit `~/.claude/settings.json` directly. The hooks structure:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Running Bash tool'"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Tool completed'"
          }
        ]
      }
    ]
  }
}
```

### Supported hook events

- `PreToolUse` -- Before a tool is invoked (use `matcher` to target specific tools)
- `PostToolUse` -- After a tool completes
- `SubagentStop` -- When a subagent finishes
- `TaskComplete` -- When a task is marked complete

## MCP Server Setup

MCP (Model Context Protocol) servers extend Claude Code with additional tools. Velocity discovers and displays configured servers automatically.

### Configuring an MCP server

Add servers to Claude Code's settings. Example for a filesystem MCP server:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/allowed/dir"
      ]
    }
  }
}
```

### Verifying in Velocity

1. Navigate to the MCP page after adding a server
2. Click the refresh button to trigger discovery
3. The server should appear as a card with its available tools listed

### Troubleshooting MCP servers

- **Server not appearing**: Ensure the command is valid and the server process starts without errors
- **Tools not loading**: The server may be slow to respond; click refresh after a few seconds
- **Error state**: Check that the MCP server binary is installed and accessible in your PATH
