export type SecurityCategory =
  | "code-execution"
  | "file-system"
  | "network"
  | "env-vars"
  | "prompt-injection"
  | "permission-escalation";

export type RiskLevel = "low" | "medium" | "high";

export interface SecurityFinding {
  category: SecurityCategory;
  severity: RiskLevel;
  title: string;
  detail: string;
  evidence?: string;
}

export interface SecurityAnalysisResult {
  overallRisk: RiskLevel;
  findings: SecurityFinding[];
  summary: string;
}

export interface SecurityAnalysisRequest {
  type: string;
  url: string;
  name: string;
  marketplaceRepo?: string;
  defaultBranch?: string;
  repo?: { owner: string; name: string };
}
