"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type TypeaheadOption = {
  id: number;
  label: string;
  meta?: string;
};

export function TypeaheadSelect(props: {
  options: TypeaheadOption[];
  value: TypeaheadOption | null;
  onChange: (v: TypeaheadOption | null) => void;

  placeholder?: string;
  minChars?: number;
  maxResults?: number;

  inputClassName?: string;

  // NEW
  allowCreate?: boolean; // allow selecting typed text as a new option
}) {
  const {
    options,
    value,
    onChange,
    placeholder = "Type 2+ chars…",
    minChars = 2,
    maxResults = 12,
    inputClassName = "th-input",
    allowCreate = false,
  } = props;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const qNorm = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!qNorm || qNorm.length < minChars) return [];
    const out: TypeaheadOption[] = [];
    for (const o of options) {
      const a = o.label.toLowerCase();
      const b = (o.meta ?? "").toLowerCase();
      if (a.includes(qNorm) || (b && b.includes(qNorm))) out.push(o);
      if (out.length >= maxResults) break;
    }
    return out;
  }, [qNorm, options, minChars, maxResults]);

  const exactExists = useMemo(() => {
    if (!qNorm) return false;
    return options.some((o) => o.label.toLowerCase() === qNorm);
  }, [qNorm, options]);

  const canCreate = allowCreate && qNorm.length >= minChars && !exactExists;

  const shownValue = value ? value.label : query;

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        className={inputClassName}
        value={shownValue}
        placeholder={value ? "" : placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          if (value) onChange(null); // typing means "not selected yet"
          setQuery(e.target.value);
          setOpen(true);
        }}
      />

      {(value || query) && (
        <button
          className="th-clear"
          type="button"
          aria-label="Clear"
          onClick={() => {
            onChange(null);
            setQuery("");
            setOpen(false);
          }}
        >
          ✕
        </button>
      )}

      {open && !value && qNorm.length >= minChars && (
        <div className="typeahead-popover" role="listbox">
          {canCreate && (
            <button
              type="button"
              className="typeahead-item"
              onClick={() => {
                onChange({ id: -1, label: qNorm }); // NEW: custom value
                setQuery("");
                setOpen(false);
              }}
            >
              <span>
                Create: <b>{qNorm}</b>
              </span>
            </button>
          )}

          {matches.length ? (
            matches.map((o) => (
              <button
                key={o.id}
                type="button"
                className="typeahead-item"
                onClick={() => {
                  onChange(o);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span>{o.label}</span>
                {o.meta && (
                  <span className="muted" style={{ marginLeft: "0.5rem" }}>
                    {o.meta}
                  </span>
                )}
              </button>
            ))
          ) : !canCreate ? (
            <div className="typeahead-empty muted">No matches</div>
          ) : null}
        </div>
      )}
    </div>
  );
}
