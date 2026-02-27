import type { ITheme } from "@xterm/xterm";

export interface TerminalAppearance {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: "block" | "underline" | "bar";
  cursorBlink: boolean;
  scrollback: number;
  theme: string;
  sessionLogging?: boolean;
  bellStyle?: "visual" | "badge" | "none";
  minimumContrastRatio?: number;
  editorCommand?: string;
}

export const DEFAULT_APPEARANCE: TerminalAppearance = {
  fontFamily: '"Berkeley Mono", "JetBrains Mono", "Fira Code", monospace',
  fontSize: 13,
  lineHeight: 1.3,
  cursorStyle: "block",
  cursorBlink: true,
  scrollback: 10000,
  theme: "one-dark",
  sessionLogging: false,
  bellStyle: "visual",
  minimumContrastRatio: 1,
  editorCommand: "code --goto {file}:{line}:{col}",
};

export const FONT_FAMILIES = [
  { value: '"Berkeley Mono", monospace', label: "Berkeley Mono" },
  { value: '"JetBrains Mono", monospace', label: "JetBrains Mono" },
  { value: '"Fira Code", monospace', label: "Fira Code" },
  { value: "Menlo, monospace", label: "Menlo" },
  { value: "Monaco, monospace", label: "Monaco" },
  { value: "monospace", label: "System Monospace" },
];

export const SCROLLBACK_OPTIONS = [
  { value: 1000, label: "1,000" },
  { value: 5000, label: "5,000" },
  { value: 10000, label: "10,000" },
  { value: 50000, label: "50,000" },
  { value: 100000, label: "Unlimited" },
];

export const TERMINAL_THEMES: Record<string, { label: string; theme: ITheme }> =
  {
    "one-dark": {
      label: "One Dark",
      theme: {
        background: "#1a1a1a",
        foreground: "#e4e4e7",
        cursor: "#3b82f6",
        selectionBackground: "rgba(59, 130, 246, 0.25)",
        black: "#1a1a1a",
        red: "#e05252",
        green: "#57c785",
        yellow: "#e5c07b",
        blue: "#61afef",
        magenta: "#c678dd",
        cyan: "#56b6c2",
        white: "#e4e4e7",
        brightBlack: "#5c5c5c",
        brightRed: "#e06c75",
        brightGreen: "#98c379",
        brightYellow: "#e5c07b",
        brightBlue: "#61afef",
        brightMagenta: "#c678dd",
        brightCyan: "#56b6c2",
        brightWhite: "#ffffff",
      },
    },
    "solarized-dark": {
      label: "Solarized Dark",
      theme: {
        background: "#002b36",
        foreground: "#839496",
        cursor: "#93a1a1",
        selectionBackground: "rgba(147, 161, 161, 0.25)",
        black: "#073642",
        red: "#dc322f",
        green: "#859900",
        yellow: "#b58900",
        blue: "#268bd2",
        magenta: "#d33682",
        cyan: "#2aa198",
        white: "#eee8d5",
        brightBlack: "#586e75",
        brightRed: "#cb4b16",
        brightGreen: "#586e75",
        brightYellow: "#657b83",
        brightBlue: "#839496",
        brightMagenta: "#6c71c4",
        brightCyan: "#93a1a1",
        brightWhite: "#fdf6e3",
      },
    },
    dracula: {
      label: "Dracula",
      theme: {
        background: "#282a36",
        foreground: "#f8f8f2",
        cursor: "#f8f8f2",
        selectionBackground: "rgba(68, 71, 90, 0.5)",
        black: "#21222c",
        red: "#ff5555",
        green: "#50fa7b",
        yellow: "#f1fa8c",
        blue: "#bd93f9",
        magenta: "#ff79c6",
        cyan: "#8be9fd",
        white: "#f8f8f2",
        brightBlack: "#6272a4",
        brightRed: "#ff6e6e",
        brightGreen: "#69ff94",
        brightYellow: "#ffffa5",
        brightBlue: "#d6acff",
        brightMagenta: "#ff92df",
        brightCyan: "#a4ffff",
        brightWhite: "#ffffff",
      },
    },
    "github-dark": {
      label: "GitHub Dark",
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#58a6ff",
        selectionBackground: "rgba(56, 139, 253, 0.25)",
        black: "#484f58",
        red: "#ff7b72",
        green: "#3fb950",
        yellow: "#d29922",
        blue: "#58a6ff",
        magenta: "#bc8cff",
        cyan: "#39c5cf",
        white: "#b1bac4",
        brightBlack: "#6e7681",
        brightRed: "#ffa198",
        brightGreen: "#56d364",
        brightYellow: "#e3b341",
        brightBlue: "#79c0ff",
        brightMagenta: "#d2a8ff",
        brightCyan: "#56d4dd",
        brightWhite: "#f0f6fc",
      },
    },
    light: {
      label: "Light",
      theme: {
        background: "#f6f8fa",
        foreground: "#1f2328",
        cursor: "#0550ae",
        selectionBackground: "rgba(9, 105, 218, 0.25)",
        black: "#24292f",
        red: "#cf222e",
        green: "#116329",
        yellow: "#9a6700",
        blue: "#0969da",
        magenta: "#8250df",
        cyan: "#1b7c83",
        white: "#57606a",
        brightBlack: "#6e7781",
        brightRed: "#a40e26",
        brightGreen: "#1a7f37",
        brightYellow: "#9a6700",
        brightBlue: "#218bff",
        brightMagenta: "#a475f9",
        brightCyan: "#3192aa",
        brightWhite: "#24292f",
      },
    },
  };
