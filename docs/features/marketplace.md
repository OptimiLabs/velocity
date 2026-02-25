# Marketplace [Status: Beta]

Plugin and extension discovery via GitHub repository search. Browse, evaluate, and install provider-scoped agents/skills/MCP servers (and Claude-specific hooks/plugins) from community sources.

## How It Works

### Architecture

1. **Sources** -- Users configure marketplace sources (GitHub search queries, specific repos, or custom registries) through `components/marketplace/SourcesDialog.tsx`. Sources are stored in SQLite via `/api/marketplace/sources`.

2. **Search and Discovery** -- `useMarketplace` hook fetches package listings from configured sources. For GitHub sources, the API searches repositories matching the source query. Results are displayed as cards with metadata: description, stars, language, and last updated date.

3. **Package Details** -- `PluginDetailDialog.tsx` shows full package information including README content, installation instructions, and a security analysis option.

4. **Installation** -- Packages can be installed directly from the marketplace. The install flow writes to the selected provider's config/artifact locations. `InstallResultDialog.tsx` shows the outcome.

### Data Flow

1. User adds a marketplace source (e.g., a GitHub search query for "claude-code mcp")
2. `/api/marketplace/` queries the GitHub API for matching repositories
3. Results are cached and displayed in `PackageList.tsx` or `PackageGrid.tsx`
4. User clicks a package to view details and optionally install
5. Installation writes to local provider configuration/artifact files

### Key Components

- `PackageCard.tsx` -- Individual package display with metadata and action buttons
- `PackageList.tsx` / `PackageGrid.tsx` -- List and grid layouts for browsing packages
- `SourceBar.tsx` -- Quick source selector at the top of the marketplace
- `AddSourceForm.tsx` -- Form to add new marketplace sources
- `HookPreviewDialog.tsx` -- Preview hook configurations before installing

## Usage

### Browsing packages

1. Navigate to the Marketplace page from the sidebar
2. Browse available packages from your configured sources
3. Use the search bar to filter results
4. Toggle between list and grid views

### Adding a source

1. Click the sources icon in the marketplace toolbar
2. Click "Add Source" and configure:
   - **Name**: A label for this source
   - **Type**: GitHub search, repository, or custom
   - **Config**: The search query or repository URL
3. The marketplace refreshes to include results from the new source

### Installing a package

1. Click on a package card to open the detail dialog
2. Review the README and package information
3. Click "Install" to add it to your Claude Code configuration
4. Review the installation result dialog for any issues

## Known Limitations

- **GitHub search reliability**: GitHub's code/repository search API can return inconsistent results, especially for broad queries. Results may vary between requests.
- **Installation failures**: Some packages may fail to install if they have complex setup requirements beyond what the automated installer handles. Manual configuration may be needed.
- **Rate limiting**: GitHub API has rate limits (60 requests/hour unauthenticated, 5000/hour with token). Set the `GITHUB_TOKEN` environment variable to avoid hitting limits during heavy browsing.
- **No automatic updates**: Installed packages are not automatically updated when new versions are published. Re-install from the marketplace to get the latest version.

## Related Files

- `hooks/useMarketplace.ts` -- React Query hooks for sources, packages, install, and security analysis
- `components/marketplace/PackageCard.tsx` -- Package display card
- `components/marketplace/PackageList.tsx` -- List layout for packages
- `components/marketplace/PackageGrid.tsx` -- Grid layout for packages
- `components/marketplace/PluginDetailDialog.tsx` -- Full package detail view
- `components/marketplace/SourcesDialog.tsx` -- Source management dialog
- `components/marketplace/InstallResultDialog.tsx` -- Post-install feedback
- `app/api/marketplace/` -- API routes for source management and package search
- `types/marketplace.ts` -- TypeScript types for marketplace entities
