// Frontier model landscape data (Feb 2026)
// All pricing per 1M tokens. null = open-weight / self-hosted (pricing varies).

export type ModelProvider =
  | "anthropic"
  | "openai"
  | "google"
  | "meta"
  | "deepseek"
  | "mistral"
  | "alibaba"
  | "zhipu"
  | "moonshot"
  | "minimax";

export type ModelStrength =
  | "coding"
  | "math-science"
  | "reasoning"
  | "multimodal"
  | "cost-efficiency"
  | "context-length"
  | "tool-use"
  | "speed";

export interface LandscapeModel {
  id: string;
  label: string;
  provider: ModelProvider;
  description: string;
  inputPrice: number | null;
  outputPrice: number | null;
  contextWindow: number;
  contextNote?: string;
  parameterNote?: string;
  license?: string;
  strengths: ModelStrength[];
  keyFeature: string;
}

export type BenchmarkDomain = "math-science" | "coding" | "knowledge" | "vision";

export interface BenchmarkEntry {
  name: string;
  domain: BenchmarkDomain;
  scores: Record<string, number>; // model id → percentage
  description?: string; // One-liner for newcomers (shown in tooltip)
  featured?: boolean; // true = shown by default; rest behind "Show all"
}

export interface UseCaseRecommendation {
  useCase: string;
  description: string;
  primaryModel: string;
  secondaryModel: string;
  iconName: string;
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export const LANDSCAPE_MODELS: LandscapeModel[] = [
  {
    id: "claude-opus-4-6",
    label: "Claude 4.6 Opus",
    provider: "anthropic",
    description:
      "Most capable model for complex reasoning, coding, and analysis",
    inputPrice: 5.0,
    outputPrice: 25.0,
    contextWindow: 200_000,
    contextNote: "up to 1M with extended",
    strengths: ["coding", "reasoning", "tool-use"],
    keyFeature: "Enterprise reasoning & coding",
  },
  {
    id: "claude-sonnet-4-5",
    label: "Claude 4.5 Sonnet",
    provider: "anthropic",
    description: "Fast and capable — best balance of cost and quality",
    inputPrice: 3.0,
    outputPrice: 15.0,
    contextWindow: 200_000,
    strengths: ["coding", "reasoning", "speed"],
    keyFeature: "Balanced cost / quality",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude 4.6 Sonnet",
    provider: "anthropic",
    description: "Fast and capable with 1M context window — best balance of cost, quality, and context length",
    inputPrice: 3.0,
    outputPrice: 15.0,
    contextWindow: 1_000_000,
    strengths: ["coding", "reasoning", "speed", "context-length"],
    keyFeature: "1M context + balanced cost/quality",
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude 4.5 Haiku",
    provider: "anthropic",
    description:
      "Fastest Claude model for triage, subagents, and high-volume tasks",
    inputPrice: 1.0,
    outputPrice: 5.0,
    contextWindow: 200_000,
    strengths: ["speed", "cost-efficiency", "tool-use"],
    keyFeature: "Speed, subagents, triage",
  },
  {
    id: "o3",
    label: "o3",
    provider: "openai",
    description:
      "OpenAI's advanced reasoning model for Codex CLI — strong at multi-step coding tasks",
    inputPrice: 2.0,
    outputPrice: 8.0,
    contextWindow: 200_000,
    strengths: ["reasoning", "coding", "tool-use"],
    keyFeature: "Codex CLI default reasoning model",
  },
  {
    id: "o4-mini",
    label: "o4-mini",
    provider: "openai",
    description:
      "Fast, cost-efficient reasoning model optimized for Codex CLI automation",
    inputPrice: 0.5,
    outputPrice: 2.0,
    contextWindow: 200_000,
    strengths: ["speed", "cost-efficiency", "coding"],
    keyFeature: "Fast Codex automation",
  },
  {
    id: "codex-mini-latest",
    label: "Codex Mini",
    provider: "openai",
    description:
      "Lightweight Codex-optimized model for rapid prototyping and simple tasks",
    inputPrice: 0.25,
    outputPrice: 1.0,
    contextWindow: 128_000,
    strengths: ["speed", "cost-efficiency", "coding"],
    keyFeature: "Ultra-fast Codex prototyping",
  },
  {
    id: "gpt-5.2-pro",
    label: "GPT-5.2 Pro",
    provider: "openai",
    description:
      "Highest accuracy on PhD-level science and mathematics benchmarks",
    inputPrice: 21.0,
    outputPrice: 168.0,
    contextWindow: 256_000,
    strengths: ["math-science", "reasoning"],
    keyFeature: "PhD-level accuracy",
  },
  {
    id: "gpt-5.2-thinking",
    label: "GPT-5.2 Thinking",
    provider: "openai",
    description: "Extended reasoning model optimized for logical deduction",
    inputPrice: 1.75,
    outputPrice: 14.0,
    contextWindow: 400_000,
    strengths: ["reasoning", "math-science", "cost-efficiency"],
    keyFeature: "Logical deduction",
  },
  {
    id: "gpt-5.3-codex",
    label: "GPT-5.3 Codex",
    provider: "openai",
    description:
      "Terminal-native coding agent for automated prototyping and execution",
    inputPrice: null,
    outputPrice: null,
    contextWindow: 0,
    strengths: ["coding", "tool-use"],
    keyFeature: "Terminal automation, rapid prototyping",
  },
  {
    id: "gemini-3-pro",
    label: "Gemini 3 Pro",
    provider: "google",
    description:
      "Massive context model for documents, video, and multimodal analysis",
    inputPrice: 2.0,
    outputPrice: 12.0,
    contextWindow: 2_000_000,
    strengths: ["multimodal", "context-length", "reasoning"],
    keyFeature: "Massive documents & video",
  },
  {
    id: "gemini-3-flash",
    label: "Gemini 3 Flash",
    provider: "google",
    description: "High-speed multimodal model for latency-sensitive tasks",
    inputPrice: 0.5,
    outputPrice: 3.0,
    contextWindow: 1_000_000,
    strengths: ["speed", "multimodal", "cost-efficiency"],
    keyFeature: "High-speed multimodal",
  },
  {
    id: "gemini-3-deep-think",
    label: "Gemini 3 Deep Think",
    provider: "google",
    description: "Abstract reasoning specialist and ARC-AGI-2 benchmark leader",
    inputPrice: null,
    outputPrice: null,
    contextWindow: 0,
    strengths: ["reasoning", "math-science"],
    keyFeature: "Abstract reasoning (ARC-AGI-2 leader)",
  },
  {
    id: "deepseek-v3.2",
    label: "DeepSeek V3.2",
    provider: "deepseek",
    description:
      "Extremely cost-efficient open-weight model with strong benchmarks",
    inputPrice: 0.07,
    outputPrice: 0.2,
    contextWindow: 128_000,
    parameterNote: "685B MoE, 37B active",
    license: "MIT",
    strengths: ["cost-efficiency", "coding", "reasoning"],
    keyFeature: "Cost-performance king",
  },
  {
    id: "deepseek-speciale",
    label: "DeepSeek Speciale",
    provider: "deepseek",
    description:
      "High-compute reasoning variant — API-only, no tool calling",
    inputPrice: null,
    outputPrice: null,
    contextWindow: 128_000,
    parameterNote: "685B MoE, 37B active (reasoning mode)",
    license: "MIT",
    strengths: ["math-science", "reasoning"],
    keyFeature: "IMO/IOI gold-medal reasoning",
  },
  {
    id: "kimi-k2.5",
    label: "Kimi K2.5",
    provider: "moonshot",
    description:
      "Trillion-parameter MoE with parallel Agent Swarm execution",
    inputPrice: 0.6,
    outputPrice: 3.0,
    contextWindow: 256_000,
    parameterNote: "1T MoE, 32B active",
    license: "Open Source",
    strengths: ["reasoning", "multimodal", "coding"],
    keyFeature: "Agent Swarm parallel execution",
  },
  {
    id: "glm-5",
    label: "GLM-5",
    provider: "zhipu",
    description:
      "General-purpose flagship from Z.ai with strong multilingual reasoning",
    inputPrice: 0.8,
    outputPrice: 2.56,
    contextWindow: 128_000,
    parameterNote: "744B MoE, 40B active",
    strengths: ["reasoning", "coding", "cost-efficiency", "tool-use"],
    keyFeature: "Multilingual reasoning & agentic engineering",
  },
  {
    id: "minimax-m2.5-standard",
    label: "M2.5 Standard",
    provider: "minimax",
    description:
      "Ultra-low-cost general-purpose model for high-volume workloads",
    inputPrice: 0.15,
    outputPrice: 1.2,
    contextWindow: 128_000,
    strengths: ["cost-efficiency", "coding", "tool-use"],
    keyFeature: "Ultra-low cost general purpose",
  },
  {
    id: "minimax-m2.5-lightning",
    label: "M2.5 Lightning",
    provider: "minimax",
    description:
      "Speed-optimized variant with higher throughput for latency-sensitive tasks",
    inputPrice: 0.3,
    outputPrice: 2.4,
    contextWindow: 128_000,
    strengths: ["speed", "cost-efficiency", "tool-use"],
    keyFeature: "Fast inference, competitive pricing",
  },
  {
    id: "llama-4-maverick",
    label: "Llama 4 Maverick",
    provider: "meta",
    description:
      "Open-weight reasoning model for low-cost high-volume workloads",
    inputPrice: 0.15,
    outputPrice: 0.6,
    contextWindow: 1_000_000,
    parameterNote: "400B MoE, 17B active, 128 experts",
    license: "Llama 4",
    strengths: ["cost-efficiency", "reasoning", "multimodal", "tool-use"],
    keyFeature: "Low-cost reasoning",
  },
  {
    id: "llama-4-scout",
    label: "Llama 4 Scout",
    provider: "meta",
    description:
      "Ultra-long context model for parsing massive codebases and histories",
    inputPrice: 0.08,
    outputPrice: 0.3,
    contextWindow: 10_000_000,
    parameterNote: "109B MoE, 17B active",
    license: "Llama 4",
    strengths: ["context-length", "cost-efficiency"],
    keyFeature: "Massive history parse (10M ctx)",
  },
];


// ---------------------------------------------------------------------------
// Provider colors
// ---------------------------------------------------------------------------

export const PROVIDER_COLORS: Record<
  ModelProvider,
  { bg: string; text: string; border: string }
> = {
  anthropic: {
    bg: "bg-orange-500/15",
    text: "text-orange-600 dark:text-orange-400",
    border: "border-orange-500/25",
  },
  openai: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/25",
  },
  google: {
    bg: "bg-blue-500/15",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-blue-500/25",
  },
  meta: {
    bg: "bg-indigo-500/15",
    text: "text-indigo-600 dark:text-indigo-400",
    border: "border-indigo-500/25",
  },
  deepseek: {
    bg: "bg-cyan-500/15",
    text: "text-cyan-600 dark:text-cyan-400",
    border: "border-cyan-500/25",
  },
  mistral: {
    bg: "bg-amber-500/15",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/25",
  },
  alibaba: {
    bg: "bg-purple-500/15",
    text: "text-purple-600 dark:text-purple-400",
    border: "border-purple-500/25",
  },
  zhipu: {
    bg: "bg-teal-500/15",
    text: "text-teal-600 dark:text-teal-400",
    border: "border-teal-500/25",
  },
  moonshot: {
    bg: "bg-rose-500/15",
    text: "text-rose-600 dark:text-rose-400",
    border: "border-rose-500/25",
  },
  minimax: {
    bg: "bg-fuchsia-500/15",
    text: "text-fuchsia-600 dark:text-fuchsia-400",
    border: "border-fuchsia-500/25",
  },
};

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

export const BENCHMARK_DATA: BenchmarkEntry[] = [
  // Math / Science
  {
    name: "GPQA Diamond",
    domain: "math-science",
    description:
      "PhD-level science questions across biology, chemistry, and physics",
    featured: true,
    scores: {
      "gpt-5.2-pro": 93.2,
      "gemini-3-deep-think": 93.8,
      "claude-opus-4-6": 87.0,
      "deepseek-v3.2": 82.4,
      "kimi-k2.5": 87.6,
      "glm-5": 86.0,
      "gpt-5.2-thinking": 92.4,
      "gemini-3-pro": 91.9,
      "gemini-3-flash": 90.4,
    },
  },
  {
    name: "AIME 2026",
    domain: "math-science",
    description:
      "American Invitational Math Exam — competition-level math problems",
    featured: true,
    scores: {
      "gpt-5.2-pro": 100,
      "gemini-3-deep-think": 96.0,
      "claude-opus-4-6": 94.4,
      "deepseek-v3.2": 93.1,
      "glm-5": 92.7,
      "kimi-k2.5": 96.1,
      "deepseek-speciale": 96.0,
    },
  },
  {
    name: "OTIS Mock AIME",
    domain: "math-science",
    description: "Practice competition math from the OTIS training program",
    scores: {
      "gpt-5.2-pro": 96.1,
      "gemini-3-deep-think": 95.2,
      "claude-opus-4-6": 94.4,
      "deepseek-v3.2": 88.7,
    },
  },
  {
    name: "ARC-AGI-2",
    domain: "math-science",
    description: "Abstract pattern reasoning and novel problem solving",
    scores: {
      "gpt-5.2-pro": 54.2,
      "gemini-3-deep-think": 84.6,
      "claude-opus-4-6": 68.8,
      "deepseek-v3.2": 45.2,
    },
  },
  {
    name: "Humanity's Last Exam",
    domain: "math-science",
    description:
      "Crowd-sourced questions designed to be the hardest possible evaluation",
    scores: {
      "kimi-k2.5": 50.2,
      "glm-5": 50.4,
      "gpt-5.2-thinking": 45.5,
      "claude-opus-4-6": 43.4,
      "gemini-3-pro": 45.8,
    },
  },
  // Coding
  {
    name: "SWE-Bench Verified",
    domain: "coding",
    description: "Resolve real GitHub issues in popular open-source repos",
    featured: true,
    scores: {
      "gpt-5.3-codex": 80.0,
      "claude-opus-4-6": 80.9,
      "deepseek-v3.2": 73.1,
      "gemini-3-pro": 76.2,
      "kimi-k2.5": 76.8,
      "glm-5": 77.8,
      "gpt-5.2-thinking": 80.0,
      "minimax-m2.5-standard": 80.2,
      "gemini-3-flash": 78.0,
      "claude-sonnet-4-5": 77.2,
      "claude-haiku-4-5": 73.3,
    },
  },
  {
    name: "SWE-Bench Pro",
    domain: "coding",
    description: "Harder subset of SWE-Bench with multi-step resolutions",
    scores: {
      "gpt-5.3-codex": 56.8,
      "claude-opus-4-6": 51.2,
      "deepseek-v3.2": 52.1,
      "gemini-3-pro": 48.7,
    },
  },
  {
    name: "Terminal-Bench 2.0",
    domain: "coding",
    description:
      "Terminal-based coding tasks including file manipulation and scripting",
    featured: true,
    scores: {
      "gpt-5.3-codex": 77.3,
      "claude-opus-4-6": 65.4,
      "deepseek-v3.2": 60.1,
      "gemini-3-pro": 56.2,
      "glm-5": 56.2,
      "kimi-k2.5": 50.8,
    },
  },
  {
    name: "LiveCodeBench v6",
    domain: "coding",
    description:
      "Continuously updated coding challenges to prevent data contamination",
    scores: { "kimi-k2.5": 85.0 },
  },
  {
    name: "SWE-Bench Multi",
    domain: "coding",
    description:
      "Multi-repo software engineering across interconnected codebases",
    scores: {
      "glm-5": 73.3,
      "deepseek-v3.2": 70.2,
      "kimi-k2.5": 73.0,
    },
  },
  // Knowledge
  {
    name: "MMLU-Pro",
    domain: "knowledge",
    description:
      "Graduate-level knowledge across 57 subjects with harder distractors",
    featured: true,
    scores: {
      "kimi-k2.5": 87.1,
      "glm-5": 70.4,
      "gemini-3-flash": 81.2,
      "gemini-3-pro": 81.0,
      "llama-4-maverick": 80.5,
      "llama-4-scout": 80.5,
    },
  },
  {
    name: "SimpleQA",
    domain: "knowledge",
    description: "Short-form factual accuracy with graded responses",
    scores: { "glm-5": 48.0 },
  },
  {
    name: "IFEval",
    domain: "knowledge",
    description:
      "Instruction-following evaluation with verifiable format constraints",
    scores: { "glm-5": 88.0 },
  },
  {
    name: "BrowseComp",
    domain: "knowledge",
    description:
      "Autonomous web navigation to find specific information",
    featured: true,
    scores: {
      "claude-opus-4-6": 84.0,
      "kimi-k2.5": 78.4,
      "glm-5": 75.9,
      "deepseek-v3.2": 67.6,
      "gpt-5.2-thinking": 65.8,
      "gemini-3-pro": 59.2,
    },
  },
  {
    name: "BigLaw Bench",
    domain: "knowledge",
    description:
      "Legal reasoning on bar-exam and case-law analysis",
    scores: {
      "claude-opus-4-6": 90.2,
    },
  },
  {
    name: "\u03C4\u00B2-Bench Telecom",
    domain: "knowledge",
    description:
      "Multi-turn tool-calling reliability in telecom domain",
    scores: {
      "glm-5": 89.7,
      "deepseek-v3.2": 85.3,
      "kimi-k2.5": 80.2,
    },
  },
  // Vision
  {
    name: "MathVista (mini)",
    domain: "vision",
    description:
      "Mathematical reasoning over visual diagrams, charts, and figures",
    featured: true,
    scores: { "kimi-k2.5": 90.1 },
  },
  {
    name: "MMMU-Pro",
    domain: "vision",
    description:
      "College-level multimodal understanding across multiple disciplines",
    scores: {
      "kimi-k2.5": 78.5,
      "gemini-3-flash": 81.2,
      "gemini-3-pro": 81.0,
    },
  },
  {
    name: "VideoMME",
    domain: "vision",
    description: "Long-form video understanding and question answering",
    scores: { "kimi-k2.5": 87.4 },
  },
  {
    name: "Video-MMMU",
    domain: "vision",
    description:
      "Long-form video understanding and temporal reasoning",
    featured: true,
    scores: {
      "gemini-3-pro": 87.6,
    },
  },
  {
    name: "ChartQA",
    domain: "vision",
    description:
      "Chart and graph comprehension from visual input",
    scores: {
      "llama-4-maverick": 90.0,
      "llama-4-scout": 88.0,
    },
  },
  {
    name: "DocVQA",
    domain: "vision",
    description:
      "Document visual question answering on scanned forms",
    scores: {
      "llama-4-maverick": 94.4,
      "llama-4-scout": 93.5,
    },
  },
];

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

export const RECOMMENDATIONS: UseCaseRecommendation[] = [
  {
    useCase: "Complex software engineering",
    description:
      "Architecture, multi-file refactors, debugging complex systems",
    primaryModel: "claude-opus-4-6",
    secondaryModel: "gpt-5.3-codex",
    iconName: "Code",
  },
  {
    useCase: "Math & scientific research",
    description: "PhD-level proofs, competition math, scientific analysis",
    primaryModel: "gpt-5.2-pro",
    secondaryModel: "deepseek-speciale",
    iconName: "FlaskConical",
  },
  {
    useCase: "Multimodal & large documents",
    description: "Video analysis, massive PDFs, long-context understanding",
    primaryModel: "gemini-3-pro",
    secondaryModel: "llama-4-scout",
    iconName: "FileVideo",
  },
  {
    useCase: "High-volume automation",
    description: "Batch processing, triage, subagent orchestration at scale",
    primaryModel: "llama-4-maverick",
    secondaryModel: "deepseek-v3.2",
    iconName: "Zap",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  meta: "Meta",
  deepseek: "DeepSeek",
  mistral: "Mistral",
  alibaba: "Alibaba",
  zhipu: "Zhipu",
  moonshot: "Moonshot AI",
  minimax: "MiniMax",
};

export function getModelsByProvider(provider: ModelProvider): LandscapeModel[] {
  return LANDSCAPE_MODELS.filter((m) => m.provider === provider);
}

export function getProviderLabel(provider: ModelProvider): string {
  return PROVIDER_LABELS[provider];
}

export function getModelsWithPricing(): LandscapeModel[] {
  return LANDSCAPE_MODELS.filter(
    (m) => m.inputPrice !== null && m.outputPrice !== null,
  );
}

export function getModelById(id: string): LandscapeModel | undefined {
  return LANDSCAPE_MODELS.find((m) => m.id === id);
}

export function formatContextWindow(tokens: number): string {
  if (tokens <= 0) return "—";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
  return `${(tokens / 1_000).toFixed(0)}K`;
}
