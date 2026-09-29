const fs = require('fs');

let content = fs.readFileSync('src/app/page.tsx', 'utf8');

const replacements = [
  { from: /\btext-white\b/g, to: 'text-black dark:text-white' },
  { from: /\btext-white\/(\d+)\b/g, to: 'text-black/$1 dark:text-white/$1' },
  { from: /\bbg-white\/(\d+)\b/g, to: 'bg-black/$1 dark:bg-white/$1' },
  { from: /\bbg-black\/(\d+)\b/g, to: 'bg-white/$1 dark:bg-black/$1' },
  { from: /\bborder-white\/(\d+)\b/g, to: 'border-black/$1 dark:border-white/$1' },
  { from: /\bhover:bg-white\/(\d+)\b/g, to: 'hover:bg-black/$1 dark:hover:bg-white/$1' },
  { from: /\bhover:text-white\b/g, to: 'hover:text-black dark:hover:text-white' },
  { from: /\bfocus:bg-white\/(\d+)\b/g, to: 'focus:bg-black/$1 dark:focus:bg-white/$1' },
  { from: /\bfocus:text-white\b/g, to: 'focus:text-black dark:focus:text-white' },
  { from: /\bprose-invert\b/g, to: 'prose dark:prose-invert' },
  { from: /\bbg-\[#1a1b1e\]\b/g, to: 'bg-white dark:bg-[#1a1b1e]' },
  { from: /\bbg-\[#2f2f2f\]\/80\b/g, to: 'bg-white/80 dark:bg-[#2f2f2f]/80' },
  { from: /\bbg-\[#3f3f3f\]\b/g, to: 'bg-black/10 dark:bg-[#3f3f3f]' },
];

let newContent = content;
for (const r of replacements) {
  newContent = newContent.replace(r.from, r.to);
}

fs.writeFileSync('src/app/page.tsx', newContent);
console.log('Transformed page.tsx successfully!');
