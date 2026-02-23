"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type TypeaheadOption = {
  id: number;
  label: string;
  meta?: string; // optional extra text (like ABB)
};

export function TypeaheadSelect(props: {
  options: TypeaheadOption[];
  value: TypeaheadOption | null;
  onChange: (v: TypeaheadOption | null) => void;

  placeholder?: string;
  minChars?: number;
  maxResults?: number;

  // optional: reuse your existing input class
  inputClassName?: string;
}) {
  const {
    options,
    value,
    onChange,
    placeholder = "Type 2+ chars…",
    minChars = 2,
    maxResults = 12,
    inputClassName = "th-input",
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

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < minChars) return [];
    const out: TypeaheadOption[] = [];
    for (const o of options) {
      const a = o.label.toLowerCase();
      const b = (o.meta ?? "").toLowerCase();
      if (a.includes(q) || (b && b.includes(q))) out.push(o);
      if (out.length >= maxResults) break;
    }
    return out;
  }, [query, options, minChars, maxResults]);

  const shownValue = value ? value.label : query;

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        className={inputClassName}
        value={shownValue}
        placeholder={value ? "" : placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          // typing means "not selected yet"
          if (value) onChange(null);
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

      {open && !value && query.trim().length >= minChars && (
        <div className="typeahead-popover" role="listbox">
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
          ) : (
            <div className="typeahead-empty muted">No matches</div>
          )}
        </div>
      )}
    </div>
  );
}
