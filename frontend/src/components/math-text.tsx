"use client";

// Hiển thị công thức LaTeX ($…$, $$…$$) bằng KaTeX trong câu trả lời và thẻ học. CSS KaTeX nạp ở app/layout.tsx.

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

export const remarkMathPlugins = [remarkMath];
export const rehypeMathPlugins = [rehypeKatex];

// Công thức trong dòng là phương trình đầy đủ (có "=" và phân số/tổng/tích phân/giới hạn/căn) → xuống dòng riêng cho dễ
// đọc; ký hiệu ngắn ("$x=x(t)$", "$\cos x$") vẫn nằm trong câu.
const BIG_FORMULA = /=.*\\(frac|d?sum|i*int|oint|lim|prod|sqrt)|\\(frac|d?sum|i*int|oint|lim|prod|sqrt).*=/;
// $$công thức$$ + dấu câu/nhãn trích dẫn ngay sau ("…$$. [6]", "$$ [1][2]:") — dấu và [n] đi liền công thức
const DISPLAY = /\$\$([\s\S]+?)\$\$((?:\s*[.,;:])?(?:\s*\[\d{1,2}\](?:\(#cite-[^)]*\))?)*(?:\s*[.,;:])?)/g;

/** Model đôi khi viết [n] ở CUỐI công thức ("$$… \quad[3]$$") → KaTeX vẽ thành chữ, không thành nút nguồn. Đưa [n] ra
 *  sau dấu $ đóng. Regex khớp MỌI công thức (cả cái không có [n]) nên cặp $…$ không lệch; \sqrt[3]{x} không bị đụng
 *  vì [3] không nằm cuối. */
const TRAILING_CITES = /((?:\s*(?:\\q?quad|\\[,;:!])?\s*\[\d{1,2}\])+)\s*$/;
export const citesOutOfMath = (t: string) =>
  t.replace(/(\$\$)([\s\S]+?)\$\$|(\$)([^$\n]+?)\$/g, (all, d2?: string, m2?: string, d1?: string, m1?: string) => {
    const d = d2 ?? d1!, m = m2 ?? m1!;
    const cites = m.match(TRAILING_CITES)?.[1];
    if (!cites || cites.length === m.length) return all;
    return `${d}${m.slice(0, -cites.length).trimEnd()}${d} ${cites.replace(/\\q?quad|\\[,;:!]|\s+/g, "")}`;
  });

/** remark-math chỉ hiểu $…$ / $$…$$ — đổi \( \) và \[ \] mà model đôi khi dùng. $$…$$ dính liền dòng chữ bị remark-math
 *  coi là công thức TRONG DÒNG (phân số cao đè lên dòng trên/dưới) → đưa thành ĐOẠN riêng: công thức cỡ lớn
 *  (\displaystyle) + dấu câu/trích dẫn đi liền sau (khối $$ của remark-math đẩy dấu chấm và [n] xuống dòng dưới). */
export const mathDelims = (t: string, promote = false) =>
  t
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`)
    .replace(/(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g, (all, m) => (promote && BIG_FORMULA.test(m) ? `$$${m}$$` : all))
    .replace(DISPLAY, (_, m: string, tail: string) => {
      const t = tail.replace(/\s+/g, " ").trim();
      return `\n\n$\\displaystyle ${m.trim().replace(/\s*\n\s*/g, " ")}$${t && !/^[.,;:]/.test(t) ? " " : ""}${t}\n\n`;
    });

type HastNode = { type: string; value?: string; tagName?: string; properties?: Record<string, unknown> };
const isMath = (c: HastNode) =>
  c.type === "element" && c.tagName === "span" && String(c.properties?.className ?? "").includes("katex");

/** Đoạn markdown: đoạn CHỈ gồm công thức (+ dấu câu, nhãn trích dẫn) — do mathDelims tách riêng — được căn giữa;
 *  đoạn văn thường giữ căn trái. Dùng làm `components.p` của ReactMarkdown. */
export function MathP({ node, children, ...props }: React.ComponentProps<"p"> & { node?: { children: HastNode[] } }) {
  const kids = node?.children ?? [];
  const formulaOnly = kids.some(isMath) && kids.every((c) =>
    c.type === "text" ? /^[\s.,;:]*$/.test(c.value ?? "")
      : isMath(c) || (c.tagName === "a" && String(c.properties?.href ?? "").startsWith("#cite-")));
  return <p {...props} className={formulaOnly ? "text-center" : undefined}>{children}</p>;
}

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
