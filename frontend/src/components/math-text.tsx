"use client";

// Hiển thị công thức LaTeX ($…$, $$…$$) bằng KaTeX trong câu trả lời và thẻ học. CSS KaTeX nạp ở app/layout.tsx.

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

export const remarkMathPlugins = [remarkMath];
export const rehypeMathPlugins = [rehypeKatex];

/** remark-math chỉ hiểu $…$ / $$…$$ — đổi \( \) và \[ \] mà model đôi khi dùng. */
export const mathDelims = (t: string) =>
  t.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`).replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`);

/** Văn bản ngắn (câu hỏi, đáp án, thẻ…) có thể chứa công thức; render inline, không bọc <p>. */
export function M({ children }: { children?: string | null }) {
  const text = children ?? "";
  if (!/\$|\\\(|\\\[/.test(text)) return <>{text}</>; // không có công thức → khỏi chạy markdown
  return (
    <ReactMarkdown remarkPlugins={remarkMathPlugins} rehypePlugins={rehypeMathPlugins} components={{ p: ({ children: c }) => <>{c}</> }}>
      {mathDelims(text)}
    </ReactMarkdown>
  );
}
