import React, { useState } from 'react';
import Icon from '../Common/Icon';

// A bullet marker is a dash/asterisk/plus, or an emoji that renders as a
// bullet (✅ ❌ ⚠️ …). Plain symbols like © or → only count when they carry a
// variation selector (which marks them as emoji), so prose keeps rendering
// as paragraphs.
const LIST_LINE = /^(?:[-*+]|(?:[\p{Emoji_Presentation}]|[\p{Extended_Pictographic}]\ufe0f)(?:\u200d[\p{Emoji_Presentation}]|\ufe0f)*)\s+/u;
const isListLine = (line) => LIST_LINE.test(line.trim());

// Inline styles: **bold**, *italic*, `code`, ~~strike~~, [text](url)
function renderInline(text, keyPrefix) {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={key} className="px-1.5 py-0.5 rounded-md bg-surface-3 border border-border text-[12.5px] font-mono text-accent-hover">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={key} className="italic">{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('~~') && part.endsWith('~~') && part.length > 4) {
      return <del key={key} className="opacity-70">{part.slice(2, -2)}</del>;
    }
    if (part.startsWith('[')) {
      const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (match) {
        return (
          <a key={key} href={match[2]} onClick={(e) => e.preventDefault()} title={match[2]} className="text-accent-hover underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
            {match[1]}
          </a>
        );
      }
    }
    return part;
  });
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="my-2 rounded-xl border border-border bg-base overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface-2">
        <Icon name="code" size={12} />
        <span className="text-[11px] font-mono text-ink-faint">{lang || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className={`ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors ${copied ? 'text-success' : 'text-ink-faint hover:text-ink-soft'}`}
        >
          <Icon name={copied ? 'check' : 'copy'} size={11} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-3.5 text-[12.5px] font-mono leading-relaxed text-ink-soft overflow-x-auto whitespace-pre-wrap break-all">{code}</pre>
    </div>
  );
}

function renderTable(rows) {
  const cells = rows.map((row) => row.split('|').slice(1, -1).map((cell) => cell.trim()));
  const header = cells[0] || [];
  const body = cells.slice(2); // skip separator row
  return (
    <div className="my-2 rounded-xl border border-border overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="bg-surface-2">
            {header.map((cell, index) => (
              <th key={index} className="px-3 py-2 text-xs font-semibold text-ink-soft border-b border-border whitespace-nowrap">{renderInline(cell, `th-${index}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-base/40">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-1.5 text-ink-soft border-b border-border/60">{renderInline(cell, `td-${rowIndex}-${cellIndex}`)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Markdown({ content }) {
  const lines = content.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence if present
      blocks.push({ type: 'code', lang, code: buf.join('\n') });
      continue;
    }
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }
    if (/^-{3,}$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }
    if (trimmed.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        buf.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'quote', text: buf.join(' ') });
      continue;
    }
    if (isListLine(trimmed)) {
      const items = [];
      while (i < lines.length && isListLine(lines[i])) {
        const line = lines[i].trim();
        const marker = line.match(LIST_LINE)?.[0] || '';
        const bullet = marker.trim();
        // A dash/asterisk/plus is the invisible bullet dot; an emoji marker
        // (✅ ❌ ⚠️ …) is kept visible as the item's bullet.
        items.push({ text: line.slice(marker.length), bullet: /^[-*+]$/.test(bullet) ? null : bullet });
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        rows.push(lines[i].trim());
        i += 1;
      }
      blocks.push({ type: 'table', rows });
      continue;
    }
    const buf = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !isListLine(lines[i]) &&
      !/^(```|#{1,4}\s|>\s?|\d+\.\s)/.test(lines[i]) &&
      !/^-{3,}$/.test(lines[i].trim())
    ) {
      buf.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: 'p', text: buf.join(' ') });
    if (i < lines.length && lines[i].trim() === '') i += 1;
  }

  return (
    <div className="space-y-1.5">
      {blocks.map((block, index) => {
        const key = `block-${index}`;
        switch (block.type) {
          case 'code':
            return <CodeBlock key={key} lang={block.lang} code={block.code} />;
          case 'heading': {
            const Tag = block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : block.level === 3 ? 'h4' : 'h5';
            const size = block.level === 1 ? 'text-[17px]' : block.level === 2 ? 'text-[15px]' : 'text-sm';
            return <Tag key={key} className={`${size} font-semibold text-ink pt-2`}>{renderInline(block.text, key)}</Tag>;
          }
          case 'hr':
            return <hr key={key} className="my-2 border-border" />;
          case 'quote':
            return (
              <blockquote key={key} className="my-1.5 pl-3 py-0.5 border-l-2 border-accent/40 text-ink-soft">
                {renderInline(block.text, key)}
              </blockquote>
            );
          case 'ul':
            return (
              <ul key={key} className="my-1.5 space-y-1 pl-1">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="flex gap-2.5">
                    {item.bullet ? (
                      <span className="shrink-0 text-[13px] leading-[1.7]">{item.bullet}</span>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-ink-faint/50 mt-[7px] shrink-0" />
                    )}
                    <span>{renderInline(item.text, `${key}-li-${itemIndex}`)}</span>
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={key} className="my-1.5 space-y-1 pl-5 list-decimal marker:text-ink-faint">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(item, `${key}-li-${itemIndex}`)}</li>
                ))}
              </ol>
            );
          case 'table':
            return <div key={key}>{renderTable(block.rows)}</div>;
          default:
            return <p key={key} className="leading-relaxed">{renderInline(block.text, key)}</p>;
        }
      })}
    </div>
  );
}
