import { useMemo } from "react";
import hljs from "highlight.js/lib/common";

interface Props {
  code: string;
  lang?: string;
  className?: string;
}

export function CodeBlock({ code, lang, className }: Props) {
  const { html, resolvedLang } = useMemo(() => {
    const safeLang = lang && hljs.getLanguage(lang) ? lang : undefined;
    try {
      if (safeLang) {
        const r = hljs.highlight(code, { language: safeLang, ignoreIllegals: true });
        return { html: r.value, resolvedLang: safeLang };
      }
      const r = hljs.highlightAuto(code);
      return { html: r.value, resolvedLang: r.language ?? "plaintext" };
    } catch {
      return { html: escapeHtml(code), resolvedLang: "plaintext" };
    }
  }, [code, lang]);

  const cls = `hljs language-${resolvedLang}`;
  return (
    <pre className={`codeblock${className ? " " + className : ""}`}>
      <code className={cls} dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
