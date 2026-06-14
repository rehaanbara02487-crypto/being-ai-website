import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function CodeBlock({ language, children }) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, "");

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="ws-code-block">
      <div className="ws-code-block-header">
        <span>{language || "code"}</span>
        <button className="ws-btn ws-btn-ghost" onClick={copyCode} type="button">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function MarkdownMessage({ content, isStreaming = false }) {
  if (!content && isStreaming) {
    return <span className="ws-muted">Thinking...</span>;
  }

  if (!content) {
    return null;
  }

  return (
    <div className="ws-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const isBlock = String(children).includes("\n") || match;

            if (isBlock) {
              return <CodeBlock language={match?.[1]}>{children}</CodeBlock>;
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          pre({ children }) {
            return <>{children}</>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
