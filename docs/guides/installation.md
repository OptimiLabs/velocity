# Installation Guide

## System Requirements

- **Bun** 1.0 or later (primary runtime and package manager)
- **Node.js** 18 or later (required for native module compilation)
- **Operating System**: macOS or Linux (Windows is not officially supported)
- **Git**: For cloning the repository

## Step-by-Step Installation

### 1. Clone the repository

```bash
git clone https://github.com/OptimiLabs/velocity.git
cd velocity
```

### 2. Install dependencies (optional preinstall)

```bash
bun install
```

`bun dev` can install these automatically, but running `bun install` first is
useful if you want setup to complete before launching the dev server.
Dependencies include native modules like `node-pty` and `better-sqlite3`.

### 3. Verify the installation

```bash
# Check that the build succeeds
bun run build

# Or start the development server directly (auto-installs deps if needed)
bun run dev
```

The development server starts on `http://localhost:3000` by default.

### 4. Start the WebSocket server

The console feature requires the WebSocket server for terminal PTY connections:

```bash
bun run watcher
```

This starts the file watcher and WebSocket server (default port 3001).

### 5. Verify everything is running

- Open `http://localhost:3000` in your browser
- The sidebar should load with navigation to all features
- Navigate to Analytics to verify JSONL log discovery is working (if you have existing Claude Code sessions)

## node-pty Troubleshooting

The `node-pty` package is a native C++ addon that compiles during `bun install`. If compilation fails:

### Missing build tools (macOS)

```bash
# Install Xcode command line tools
xcode-select --install
```

### Missing build tools (Linux)

```bash
# Debian/Ubuntu
sudo apt-get install -y build-essential python3

# Fedora/RHEL
sudo dnf groupinstall "Development Tools"
sudo dnf install python3
```

### Rebuild native modules

If you switch Node.js versions or encounter runtime errors:

```bash
bun install --force
```

### better-sqlite3 issues

The `better-sqlite3` package also compiles native code. The same build tools are required. If it fails independently:

```bash
# Clear the module cache and reinstall
rm -rf node_modules
bun install
```

## Claude CLI Setup

The Console feature launches Claude Code sessions, which requires the Claude CLI:

1. Install the Claude CLI following the official instructions at [https://docs.anthropic.com/en/docs/claude-code](https://docs.anthropic.com/en/docs/claude-code)
2. Authenticate with `claude login`
3. Verify with `claude --version`

The Analytics and Usage features work without the CLI -- they read existing JSONL session logs from `~/.claude/projects/`.

## Common Errors and Fixes

### "EACCES: permission denied" on install

```bash
# Ensure your user owns the node_modules directory
sudo chown -R $(whoami) node_modules
```

### Port 3000 already in use

```bash
# Use a different port
PORT=3002 bun run dev
```

### Port 3001 (WebSocket) already in use

Check for orphaned processes from a previous run:

```bash
lsof -i :3001
# Kill the process if it's a leftover watcher
kill <PID>
```

### "Cannot find module 'node-pty'" at runtime

This usually means native compilation failed silently. Rebuild:

```bash
rm -rf node_modules
bun install
```

### SQLite database locked errors

Velocity uses better-sqlite3 which requires exclusive file locks. Ensure only one instance of the development server is running. If the database is corrupted:

```bash
# The database is auto-created; removing it triggers a fresh setup
rm -f velocity.db
```

### Analytics shows no data

Velocity reads Claude Code JSONL logs from `~/.claude/projects/`. Verify:

```bash
# Check that log files exist
ls ~/.claude/projects/
```

If the directory is empty, start a Claude Code session first to generate logs.
