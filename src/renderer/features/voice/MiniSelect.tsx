/**
 * =============================================================================
 * MiniSelect — compact custom dropdown (POPUP CONTAINMENT: never <select>)
 * =============================================================================
 *
 * Native `<select>` popups are separate OS windows that LEAK into screen
 * captures even while the overlay is content-protected — so all dropdowns in
 * Barely are plain in-window React components.
 *
 * The menu opens UPWARD from the trigger (the Voice tab keeps this control in
 * the lower half, so the list floats over the transcript — always inside the
 * panel's scrollport, never outside the window).
 * =============================================================================
 */

import { useEffect, useRef, useState } from "react";

export interface MiniSelectOption {
  value: string;
  label: string;
}

interface MiniSelectProps {
  value: string;
  options: MiniSelectOption[];
  onChange: (value: string) => void;
  /** Accessible name (also labels the popup list). */
  ariaLabel: string;
  /** Shown when `value` matches no option. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function MiniSelect({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = "Select…",
  disabled = false,
  className,
}: MiniSelectProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const current = options.find((option) => option.value === value) ?? null;

  // Dismiss on outside press / Escape (in-window only — no native menus).
  useEffect(() => {
    if (!open) return;
    const handlePress = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePress);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePress);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className={`mini-select${className ? ` ${className}` : ""}`} ref={rootRef}>
      <button
        type="button"
        className="mini-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className="mini-select__value">{current?.label ?? placeholder}</span>
        <span className={`mini-select__caret${open ? " mini-select__caret--open" : ""}`} aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <ul className="mini-select__menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <li
                key={option.value === "" ? "__default__" : option.value}
                role="option"
                aria-selected={selected}
                className={`mini-select__option${selected ? " mini-select__option--active" : ""}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="mini-select__option-label">{option.label}</span>
                {selected ? <span aria-hidden="true">✓</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
