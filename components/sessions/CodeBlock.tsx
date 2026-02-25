"use client";

import { useMemo } from "react";
import hljs from "highlight.js/lib/core";
import json from "highlight.js/lib/languages/json";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import bash from "highlight.js/lib/languages/bash";
import xml from "highlight.js/lib/languages/xml";
import python from "highlight.js/lib/languages/python";
import { cn } from "@/lib/utils";

// Register only languages we actually encounter in tool I/O
hljs.registerLanguage("json", json);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("python", python);

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
  detectLanguage?: boolean;
}

function tryDetectJson(code: string): boolean {
  const trimmed = code.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    JSON.parse(code);
    return true;
  } catch {
    return false;
  }
}

export function CodeBlock({
  code,
  language,
  className,
  detectLanguage = true,
}: CodeBlockProps) {
  const highlighted = useMemo(() => {
    const lang = language || (tryDetectJson(code) ? "json" : undefined);

    if (lang) {
      try {
        const result = hljs.highlight(code, { language: lang });
        return result.value;
      } catch {
        /* fall through */
      }
    }

    if (detectLanguage) {
      try {
        const result = hljs.highlightAuto(code);
        if (result.relevance > 5) return result.value;
      } catch {
        /* fall through */
      }
    }

    return null;
  }, [code, language, detectLanguage]);

  if (!highlighted) {
    return (
      <pre className={cn("text-xs font-mono whitespace-pre-wrap", className)}>
        {code}
      </pre>
    );
  }

  return (
    <pre
      className={cn("text-xs font-mono whitespace-pre-wrap hljs", className)}
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
}
