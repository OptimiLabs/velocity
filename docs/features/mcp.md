# MCP [Status: Stable]

MCP (Model Context Protocol) server management. View, discover, and monitor MCP servers configured for Claude Code, including their available tools and usage statistics.

## How It Works

### Architecture

1. **Discovery** -- `useMCPDiscover` hook fetches from `/api/tools/mcp/discover` to enumerate all MCP servers and their tools. Each server entry includes its tool list (name, description, input schema) and a timestamp of when it was last fetched.

2. **Usage Tracking** -- `useMCPUsage` hook fetches from `/api/tools/mcp/usage` to retrieve call counts and last-used timestamps for each MCP tool. This data is derived from JSONL session log analysis.

3. **Refresh** -- `useRefreshMCPDiscover` triggers a re-discovery of MCP servers, updating the tool cache with any newly added or removed tools.

4. **UI Components** -- `MCPServerCard.tsx` displays a single MCP server with its status, tool count, and expandable tool list. `MCPToolList.tsx` renders the detailed tool inventory for a server.

### Data Flow

1. Claude Code's configuration (`settings.json`) defines MCP servers
2. `/api/tools/mcp/discover` reads the configuration and probes each server for its tool manifest
3. Tool metadata is cached and served to the frontend
4. Usage data is aggregated from JSONL session logs by counting MCP tool invocations
5. The MCP page renders server cards with tool lists and usage badges

## Usage

### Viewing MCP servers

1. Navigate to the MCP page from the sidebar
2. Each configured MCP server appears as a card showing:
   - Server name and connection status
   - Number of available tools
   - Error state if the server is unreachable

### Exploring tools

1. Click on an MCP server card to expand its tool list
2. Each tool shows its name, description, and usage count
3. Tools with input schemas display the expected parameters

### Refreshing discovery

1. Click the refresh button to re-probe all MCP servers
2. This picks up newly added servers, removed servers, and tool changes
3. The cache timestamp updates to reflect the latest discovery

## Related Files

- `hooks/useMCP.ts` -- React Query hooks for MCP discovery, usage, and refresh
- `components/mcp/MCPServerCard.tsx` -- MCP server display card
- `components/mcp/MCPToolList.tsx` -- Tool list within a server card
- `app/mcp/page.tsx` -- MCP page route (if present) or integrated into tools page
- `app/api/tools/mcp/discover/` -- API route for MCP server discovery
- `app/api/tools/mcp/usage/` -- API route for MCP tool usage stats
