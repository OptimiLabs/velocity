# Security Policy

## Scope

Velocity is a **local-only** application. It runs entirely on your machine and does not operate any cloud services, external APIs (beyond optional GitHub API calls for the Marketplace), or remote data collection.

The only network services are:

- **Next.js dev server** — binds to `localhost:3000`
- **WebSocket server** — binds to `localhost:3001`

Neither service is accessible from other machines on your network.

## Data Storage

### Local Database

Velocity stores application data in a local SQLite database file. This file is created automatically on first run and is never transmitted anywhere.

### Session Data

Velocity reads Claude Code session logs from your local `~/.claude/` directory. These logs are parsed read-only and are never modified or copied elsewhere.

### Client-Side Storage

Some UI state is persisted in the browser via IndexedDB (using Dexie). This data stays in your browser and is not synced.

## Known Limitations

### API Key Storage

API keys configured in Velocity (e.g., for AI providers) are stored using **base64 encoding, not encryption**. Base64 is a reversible encoding, not a security measure. Anyone with access to your SQLite database file can decode stored keys.

**Recommendation:** Do not share your database file. If you suspect your database has been exposed, rotate any API keys stored in it.

Relevant code: `lib/db/instruction-files.ts` (`saveAIProviderKey`)

### Unencrypted Database

The SQLite database is stored as a plain file on disk with no encryption at rest. It is protected only by your operating system's file permissions.

### WebSocket Security

The WebSocket server binds to `localhost:3001` only. It does not use TLS or authentication because it is designed exclusively for local communication between the browser and the development server.

## Reporting Vulnerabilities

If you discover a security vulnerability in Velocity, please report it responsibly:

1. **Open a GitHub issue** at [https://github.com/OptimiLabs/velocity/issues](https://github.com/OptimiLabs/velocity/issues) with the label `security`
2. Or **contact the maintainers** directly through GitHub

### What to expect

- Acknowledgment within **5 business days**
- An assessment of the vulnerability and its impact
- A fix or mitigation plan for confirmed issues

Since Velocity is a local-only tool, most vulnerabilities would require local access to exploit. However, we still take all reports seriously and aim to address them promptly.
