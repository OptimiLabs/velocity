import type { ConfigProvider } from "@/types/provider";
import { getAllProviderIds, getProvidersSupporting } from "@/lib/providers/filesystem-registry";

export const CONFIG_SCOPE_ROUTES = [
  "/agents",
  "/workflows",
  "/skills",
  "/hooks",
  "/plugins",
  "/mcp",
] as const;

const ALL_PROVIDERS = getAllProviderIds();

const ROUTE_PROVIDER_SUPPORT: Record<
  (typeof CONFIG_SCOPE_ROUTES)[number],
  readonly ConfigProvider[]
> = {
  "/agents": getProvidersSupporting("agents"),
  "/workflows": getProvidersSupporting("commands"),
  "/skills": getProvidersSupporting("skills"),
  "/hooks": getProvidersSupporting("hooks"),
  "/plugins": ["claude"],
  "/mcp": ALL_PROVIDERS,
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
