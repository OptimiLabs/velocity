import type { ConfigProvider } from "@/types/provider";

export const CONFIG_SCOPE_ROUTES = [
  "/agents",
  "/workflows",
  "/skills",
  "/hooks",
  "/plugins",
  "/mcp",
] as const;

const ROUTE_PROVIDER_SUPPORT: Record<
  (typeof CONFIG_SCOPE_ROUTES)[number],
  readonly ConfigProvider[]
> = {
  "/agents": ["claude", "codex", "gemini"],
  "/workflows": ["claude", "codex", "gemini"],
  "/skills": ["claude", "codex", "gemini"],
  "/hooks": ["claude"],
  "/plugins": ["claude"],
  "/mcp": ["claude", "codex", "gemini"],
};

export function resolveConfigScopeRoute(
  pathname: string,
): (typeof CONFIG_SCOPE_ROUTES)[number] | null {
  const match = CONFIG_SCOPE_ROUTES.find(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  return match ?? null;
}

export function isConfigScopePage(pathname: string): boolean {
  return resolveConfigScopeRoute(pathname) !== null;
}

export function isProviderSupportedForConfigRoute(
  pathname: string,
  provider: ConfigProvider,
): boolean {
  const route = resolveConfigScopeRoute(pathname);
  if (!route) return true;
  return ROUTE_PROVIDER_SUPPORT[route].includes(provider);
}
