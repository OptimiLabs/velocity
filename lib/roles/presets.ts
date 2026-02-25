export interface RolePreset {
  name: string;
  label: string;
  description: string;
  icon: string; // lucide icon name for visual identification
}

export const ROLE_PRESETS: RolePreset[] = [
  {
    name: "developer",
    label: "Developer",
    description: "Implements features, writes production code, and fixes bugs",
    icon: "Code",
  },
  {
    name: "reviewer",
    label: "Reviewer",
    description:
      "Reviews code for correctness, style, and potential issues. Writes tests.",
    icon: "SearchCheck",
  },
  {
    name: "architect",
    label: "Architect",
    description:
      "Designs system architecture, defines interfaces, and plans technical approach",
    icon: "Blocks",
  },
  {
    name: "tester",
    label: "Tester",
    description:
      "Writes and runs tests, identifies edge cases, ensures coverage",
    icon: "FlaskConical",
  },
  {
    name: "frontend",
    label: "Frontend",
    description:
      "Builds UI components, handles styling, and implements client-side logic",
    icon: "Layout",
  },
  {
    name: "backend",
    label: "Backend",
    description: "Implements APIs, database logic, and server-side services",
    icon: "Server",
  },
  {
    name: "devops",
    label: "DevOps",
    description:
      "Manages CI/CD pipelines, infrastructure, and deployment configuration",
    icon: "Container",
  },
  {
    name: "tech-lead",
    label: "Tech Lead",
    description:
      "Coordinates work, makes technical decisions, and ensures alignment",
    icon: "Compass",
  },
];

export function findRolePreset(name: string): RolePreset | undefined {
  return ROLE_PRESETS.find((r) => r.name === name);
}
