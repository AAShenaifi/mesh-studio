import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import * as Switch from '@radix-ui/react-switch';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as Tooltip from '@radix-ui/react-tooltip';

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

/** Hover/focus label for icon buttons. */
export function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="bottom"
          sideOffset={6}
          className="z-50 rounded-md border border-line-strong bg-surface-3 px-2 py-1 text-xs font-semibold text-ink shadow-lg"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

interface ToolButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  showLabel?: boolean;
}

/** Toolbar button: icon with a tooltip, optionally with visible text. */
export function ToolButton({ label, active, showLabel, children, className, ...rest }: ToolButtonProps) {
  return (
    <Tip label={label}>
      <button
        type="button"
        aria-label={showLabel ? undefined : label}
        aria-pressed={active}
        className={cx(
          'inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-bold transition-colors',
          active ? 'bg-accent text-white' : 'text-muted hover:bg-surface-3 hover:text-ink',
          'disabled:opacity-40 disabled:hover:bg-transparent',
          className,
        )}
        {...rest}
      >
        {children}
        {showLabel && <span>{label}</span>}
      </button>
    </Tip>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost';
}

export function Button({ variant = 'default', className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[7px] border px-3.5 text-[13px] font-bold transition-colors disabled:opacity-45',
        variant === 'primary' && 'border-accent bg-accent text-white hover:bg-accent-hi',
        variant === 'default' && 'border-line-strong bg-surface-2 hover:bg-surface-3',
        variant === 'ghost' && 'border-transparent bg-transparent text-muted hover:bg-surface-2 hover:text-ink',
        className,
      )}
      {...rest}
    />
  );
}

/** Group of toolbar buttons with the STL Studio "pill" frame. */
export function ToolGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-[9px] border border-line bg-page p-[3px]">
      {children}
    </div>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="m-0 text-xs font-bold uppercase tracking-[0.8px] text-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function FieldRow({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-ink">
          {label}
        </label>
        {hint && <p className="m-0 text-xs leading-snug text-muted">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function SwitchInput({ id, checked, onChange, label }: { id?: string; checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <Switch.Root
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className="relative h-5 w-9 shrink-0 rounded-full border border-line-strong bg-surface-3 transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent"
    >
      <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-ink transition-transform data-[state=checked]:translate-x-[17px]" />
    </Switch.Root>
  );
}

interface Option<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Option<T>[]; onChange: (v: T) => void; label: string }) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={label}
      // Radix sends '' when the active item is clicked again; keep the current value.
      onValueChange={(v) => v && onChange(v as T)}
      className="flex gap-0.5 rounded-lg border border-line bg-page p-[3px]"
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className="rounded-md px-2.5 py-1 text-xs font-bold text-muted hover:text-ink data-[state=on]:bg-accent data-[state=on]:text-white"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

/**
 * Number input that keeps a free-text draft while typing and only commits a
 * valid, clamped number on blur or Enter (Escape reverts).
 */
export function NumberInput({
  id,
  value,
  onCommit,
  min,
  max,
  integer,
  suffix,
  label,
  compact,
}: {
  id?: string;
  value: number;
  onCommit: (v: number) => void;
  min: number;
  max: number;
  integer?: boolean;
  suffix?: string;
  label?: string;
  compact?: boolean;
}) {
  const format = (v: number) => String(integer ? Math.round(v) : Number(v.toFixed(compact ? 3 : 4)));
  const [draft, setDraft] = useState(format(value));
  const [invalid, setInvalid] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Never overwrite what the user is typing; a focused field syncs on commit/blur.
    if (document.activeElement === ref.current) return;
    setDraft(format(value));
    setInvalid(false);
  }, [value]);

  // The text shown when the field was last synced/committed: blur after Enter must not commit twice.
  const shown = useRef(format(value));
  if (document.activeElement !== ref.current) shown.current = format(value);
  const commit = () => {
    const n = Number(draft.replace(',', '.'));
    if (draft.trim() === '' || !Number.isFinite(n)) {
      setInvalid(true);
      return;
    }
    const clamped = Math.min(max, Math.max(min, integer ? Math.round(n) : n));
    setInvalid(false);
    const text = format(clamped);
    setDraft(text);
    if (text === shown.current) return;
    shown.current = text;
    onCommit(clamped);
  };

  return (
    <span className={compact ? 'flex min-w-0 flex-1' : 'inline-flex items-center gap-1.5'}>
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={invalid || undefined}
        // Lets a parent dialog ignore the first Escape, which reverts this field instead.
        data-dirty={invalid || draft !== format(value) ? 'true' : undefined}
        title={`${min} – ${max}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(format(value));
            setInvalid(false);
          }
        }}
        className={cx(
          compact ? 'w-full min-w-0 rounded-md border bg-surface-2 px-1.5 py-0.5 text-right font-mono text-[12px] outline-none' : 'w-24 rounded-[7px] border bg-surface-2 px-2 py-1 text-right font-mono text-[13px] outline-none',
          'focus:border-accent-hi focus:shadow-[0_0_0_3px_rgba(128,81,159,0.25)]',
          invalid ? 'border-err' : 'border-line',
        )}
      />
      {suffix && <span className="w-5 text-xs text-muted">{suffix}</span>}
    </span>
  );
}

export function ColorInput({ id, value, onChange, label }: { id?: string; value: string; onChange: (v: string) => void; label?: string }) {
  const fallbackId = useId();
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-xs text-muted">{value}</span>
      <input
        id={id ?? fallbackId}
        type="color"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 cursor-pointer"
      />
    </span>
  );
}
