import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CornerDownLeft, Search } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface Command {
  id: string;
  label: string;
  group: string;
  icon: ReactNode;
  hint?: string;
  run: () => void;
}

/** Ctrl/⌘+K quick jump: type to filter, arrows to move, Enter to go. */
export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.label} ${c.group} ${c.hint ?? ''}`.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setIndex(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (!open) return null;

  const choose = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = '';
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" onKeyDown={onKey}>
      <div className="absolute inset-0 animate-page-in bg-brand-950/50 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-label="Quick search" className="relative w-full max-w-lg animate-page-in overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4">
          <Search className="size-4.5 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a page or action…"
            className="h-13 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            aria-label="Search pages and actions"
          />
          <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Esc</kbd>
        </div>
        <ul ref={listRef} className="scroll-thin max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-slate-500">Nothing matches “{query}”.</li>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <li key={c.id}>
                {header && <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{header}</div>}
                <button
                  type="button"
                  data-idx={i}
                  role="option"
                  aria-selected={i === index}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => choose(c)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    i === index ? 'bg-primary-50 text-primary-800' : 'text-slate-700',
                  )}
                >
                  <span className={cn('flex size-7 items-center justify-center rounded-md', i === index ? 'bg-surface text-primary-600' : 'bg-slate-100 text-slate-500')}>
                    {c.icon}
                  </span>
                  <span className="flex-1 truncate">{c.label}</span>
                  {c.hint && <span className="text-xs text-slate-400">{c.hint}</span>}
                  {i === index && <CornerDownLeft className="size-3.5 text-primary-500" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-4 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
          <span><kbd className="font-sans">↑↓</kbd> move</span>
          <span><kbd className="font-sans">↵</kbd> open</span>
          <span className="ml-auto"><kbd className="font-sans">Ctrl K</kbd> anytime</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
