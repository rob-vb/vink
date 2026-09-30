import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

type Token = { text: string; kind: "key" | "string" | "number" | "literal" | "comment" | "plain" };

const tokenClass: Record<Token["kind"], string> = {
  key: "text-[#9cd2ff]",
  string: "text-[#f4d58d]",
  number: "text-[#b8e3a6]",
  literal: "text-[#f0a8c8]",
  comment: "text-[#7f8ea6]",
  plain: "",
};

// A small highlighter: JSON keys and values, and for code the strings and
// comments. Enough for the handful of examples on the site, no library.
function tokenize(code: string, language: string): Token[] {
  const pattern =
    language === "json"
      ? /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\b\d+(?:\.\d+)?\b)|\b(true|false|null)\b/g
      : /(\/\/[^\n]*|#[^\n{]*$)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(\d+(?:\.\d+)?)\b|\b(true|false|null|None|True|False|const|let|return|function|import|from|def|if|not|and|or|throw|new|use|fn|elif|else|raise|await|async)\b/gm;
  const tokens: Token[] = [];
  let last = 0;
  for (const match of code.matchAll(pattern)) {
    const index = match.index;
    if (index > last) tokens.push({ text: code.slice(last, index), kind: "plain" });
    if (language === "json") {
      if (match[1] !== undefined) {
        tokens.push({ text: match[1], kind: match[2] ? "key" : "string" });
        if (match[2]) tokens.push({ text: match[2], kind: "plain" });
      } else if (match[3] !== undefined) tokens.push({ text: match[3], kind: "number" });
      else tokens.push({ text: match[4], kind: "literal" });
    } else if (match[1] !== undefined) tokens.push({ text: match[1], kind: "comment" });
    else if (match[2] !== undefined) tokens.push({ text: match[2], kind: "string" });
    else if (match[3] !== undefined) tokens.push({ text: match[3], kind: "number" });
    else tokens.push({ text: match[4], kind: "literal" });
    last = index + match[0].length;
  }
  if (last < code.length) tokens.push({ text: code.slice(last), kind: "plain" });
  return tokens;
}

/** Dark code panel, the same in light and dark mode. */
export function CodeBlock({
  code,
  language,
  header,
  copyLabels,
  className,
  maxHeight,
}: {
  code: string;
  language: string;
  header?: ReactNode;
  copyLabels?: { copy: string; copied: string };
  className?: string;
  maxHeight?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl bg-code text-code-foreground", className)}>
      {(header || copyLabels) && (
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5 font-mono text-xs">
          <div className="min-w-0 flex-1 truncate">{header}</div>
          {copyLabels && <CopyButton text={code} labels={copyLabels} />}
        </div>
      )}
      <pre
        className="overflow-auto px-4 py-3.5 font-mono text-[12.5px] leading-relaxed"
        style={maxHeight ? { maxHeight } : undefined}
        tabIndex={0}
      >
        <code>
          {tokenize(code, language).map((token, i) =>
            token.kind === "plain" ? token.text : (
              <span key={i} className={tokenClass[token.kind]}>
                {token.text}
              </span>
            ),
          )}
        </code>
      </pre>
    </div>
  );
}

/** The `POST https://…` bar above a Payload. */
export function PostBar({ url }: { url: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <b className="rounded bg-[#15803d] px-1.5 py-0.5 font-semibold text-white">POST</b>
      <span className="truncate">{url}</span>
    </span>
  );
}
