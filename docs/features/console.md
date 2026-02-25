# Console [Status: Beta]

Multi-tab PTY terminal interface for running Claude Code sessions directly from the Velocity dashboard. Each tab spawns a real pseudo-terminal connected via WebSocket, with support for tab groups, model/effort selection, and environment variable injection.

## How It Works

### Architecture

The console is built on three layers:

1. **Frontend** -- `components/console/` renders the terminal UI using xterm.js. `ConsoleLayout.tsx` manages the tab bar, sidebar, and tiling layout. `TerminalPanel.tsx` hosts individual xterm instances. `MultiSessionTiling.tsx` enables side-by-side pane arrangements.

2. **WebSocket Server** -- `server/ws-server.ts` runs a `WebSocketServer` on port 3001 (configurable). It delegates to handler modules: `ConsoleHandler` for session lifecycle, `PtyHandler` for terminal I/O, `SwarmHandler` for multi-agent coordination, and `UtilityHandler` for misc operations.

3. **PTY Manager** -- `server/pty-manager.ts` wraps `node-pty` to spawn and manage pseudo-terminal processes. Each session gets its own PTY with configurable shell, working directory, columns/rows, and environment variables. Orphan detection kills abandoned PTY processes after a timeout.

### Data Flow

1. User clicks "New Tab" in the sidebar (`ConsoleSidebar.tsx`)
2. `useMultiConsole` hook creates a `ConsoleSession` object and persists it to localStorage
3. Frontend sends a WebSocket `create-pty` message with session ID, cwd, and terminal dimensions
4. `PtyManager.create()` spawns a `node-pty` process
5. PTY output streams back over WebSocket to the xterm.js instance
6. User input flows from xterm.js through WebSocket to `PtyManager.write()`

### Key Components

- `ConsoleSidebar.tsx` -- Session list with tab groups, drag-to-reorder, right-click context menu
- `ConsoleLayout.tsx` -- Main layout orchestrator with sidebar + terminal area
- `TerminalPanel.tsx` -- Individual terminal instance with xterm.js
- `ModelPicker.tsx` / `EffortPicker.tsx` -- Configure Claude model and thinking effort per session
- `EnvPanel.tsx` -- Set environment variables for a session
- `CommandPalette.tsx` -- Quick command access via keyboard shortcut

## Usage

### Creating a new terminal session

1. Navigate to the Console page
2. Click the "+" button in the sidebar or use the keyboard shortcut
3. Select a working directory using the directory picker
4. (Optional) Choose a model, effort level, or agent profile
5. The terminal connects automatically and is ready for input

### Managing sessions

- **Rename**: Double-click the tab label in the sidebar
- **Group**: Drag tabs into groups for organization
- **Tile**: Use the layout toolbar to arrange multiple terminals side-by-side
- **Close**: Right-click a tab and select "Close", or click the X icon

### Running Claude Code

Launch `claude` in any terminal tab. The session tracks activity timestamps in SQLite for auto-archive and analytics integration.

## Known Limitations

- **Requires Claude CLI**: The terminal itself is a general-purpose PTY, but Claude Code features require the `claude` CLI to be installed and authenticated.
- **Connection drops**: If the WebSocket server restarts or the browser disconnects, active PTY sessions become orphaned. They are cleaned up after a timeout, but in-progress work may be lost.
- **PTY resize lag**: Resizing the browser window or tiling panes triggers a terminal resize. There can be a brief visual glitch as the PTY adjusts its column/row count.
- **Session persistence**: Session metadata (label, cwd, model) is persisted in localStorage. Terminal scroll-back history is not preserved across page reloads.

## Related Files

- `hooks/useMultiConsole.ts` -- Core hook managing session state, creation, deletion, grouping
- `components/console/ConsoleLayout.tsx` -- Main console page layout
- `components/console/TerminalPanel.tsx` -- xterm.js terminal wrapper
- `components/console/ConsoleSidebar.tsx` -- Session list and tab management
- `server/ws-server.ts` -- WebSocket server entry point
- `server/pty-manager.ts` -- PTY process lifecycle management
- `server/handlers/console-handler.ts` -- Console-specific WebSocket message handling
- `types/console.ts` -- TypeScript types for console sessions and WebSocket messages
- `stores/consoleLayoutStore.ts` -- Zustand store for layout preferences
- `lib/safety/constants.ts` -- Safety limits (max concurrent sessions, etc.)
