"use client";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/github-dark.css";

export function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      rehypePlugins={[rehypeHighlight]}
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="text-sm leading-relaxed mb-2 last:mb-0 text-foreground/90">
            {children}
          </p>
        ),
        code: ({ className, children, ...props }) => {
          const isInline = !className;
          return isInline ? (
            <code className="rounded border border-border/50 bg-background/80 px-1.5 py-0.5 text-[11px] font-mono">
              {children}
            </code>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-2 overflow-x-auto rounded-xl border border-border/45 bg-background/65 p-3 text-xs relative group">
            {children}
          </pre>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),
        ul: ({ children }) => (
          <ul className="mb-2 list-disc space-y-1 pl-4 text-sm text-foreground/90">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2 list-decimal space-y-1 pl-4 text-sm text-foreground/90">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="text-sm">{children}</li>,
        h1: ({ children }) => (
          <h1 className="mb-1 mt-3 text-base font-semibold tracking-tight">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-1 mt-3 text-sm font-semibold tracking-tight">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-1 mt-2 text-sm font-medium">{children}</h3>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary/30 pl-3 italic text-muted-foreground">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="table-readable table-readable-compact text-xs border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-border/50 px-2 py-1 text-left font-medium">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-border/50 px-2 py-1">{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
