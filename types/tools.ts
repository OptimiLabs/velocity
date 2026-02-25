import type { ConfigProvider } from "./provider";

export interface ToolInfo {
  name: string;
  provider?: ConfigProvider;
  type: "mcp" | "builtin" | "plugin" | "skill";
  description?: string;
  server?: string;
  version?: string;
  enabled?: boolean;
  plugin?: string;
  pluginId?: string;
  registry?: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  content?: string;
  installPath?: string;
}
