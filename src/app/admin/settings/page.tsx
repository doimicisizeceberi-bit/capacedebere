"use client";

import React, { useEffect, useMemo, useState } from "react";

type SettingRow = {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
};

type FormState = {
  color_threshold_pct: string;
  min_saturation_pct: string;
  neutral_lightness_split: string;
  enable_auto_color_detection: boolean;
};

const DEFAULTS: FormState = {
  color_threshold_pct: "5",
  min_saturation_pct: "20",
  neutral_lightness_split: "50",
  enable_auto_color_detection: true,
};

function clampIntString(v: string, min: number, max: number, fallback: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const nn = Math.round(n);
  return String(Math.min(max, Math.max(min, nn)));
}

export default function SettingsPage() {
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [dirty, setDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const lastUpdated = useMemo(() => {
    if (!rows.length) return null;
    // max updated_at
    const max = rows.reduce((acc, r) => (r.updated_at > acc ? r.updated_at : acc), rows[0].updated_at);
    return max;
  }, [rows]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load settings");

      const data: SettingRow[] = json.data || [];
      setRows(data);

      const map: Record<string, string> = json.map || {};
      setForm({
        color_threshold_pct: map.color_threshold_pct ?? DEFAULTS.color_threshold_pct,
        min_saturation_pct: map.min_saturation_pct ?? DEFAULTS.min_saturation_pct,
        neutral_lightness_split: map.neutral_lightness_split ?? DEFAULTS.neutral_lightness_split,
        enable_auto_color_detection: (map.enable_auto_color_detection ?? "true") === "true",
      });
      setDirty(false);
    } catch (e: any) {
      alert(e?.message ?? "Failed to load settings");
      setRows([]);
      setForm(DEFAULTS);
      setDirty(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    // normalize before saving
    const normalized: FormState = {
      color_threshold_pct: clampIntString(form.color_threshold_pct, 1, 50, DEFAULTS.color_threshold_pct),
      min_saturation_pct: clampIntString(form.min_saturation_pct, 0, 100, DEFAULTS.min_saturation_pct),
      neutral_lightness_split: clampIntString(form.neutral_lightness_split, 0, 100, DEFAULTS.neutral_lightness_split),
      enable_auto_color_detection: !!form.enable_auto_color_detection,
    };

    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: {
            color_threshold_pct: normalized.color_threshold_pct,
            min_saturation_pct: normalized.min_saturation_pct,
            neutral_lightness_split: normalized.neutral_lightness_split,
            enable_auto_color_detection: normalized.enable_auto_color_detection ? "true" : "false",
          },
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Save failed");

      setFlash("Saved.");
      window.setTimeout(() => setFlash(null), 1200);

      // reload to pick up updated_at
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function reset() {
    setForm(DEFAULTS);
    setDirty(true);
  }

  if (loading) return <p style={{ padding: "2rem" }}>Loading...</p>;

  return (
    <main className="page">
      <h1>Settings</h1>

      <div className="pager" style={{ marginBottom: "1rem" }}>
        <div className="filters-bar">
          <div className="filters-active">
            <span className="muted">
              Global site settings • {lastUpdated ? <>Last updated: <b>{new Date(lastUpdated).toLocaleString()}</b></> : "—"}
            </span>
          </div>

          <button className="linklike" type="button" onClick={reset}>
            Reset to defaults
          </button>
        </div>

        <div className="pager-left">
          <span className="pager-info">
            Status:{" "}
            {dirty ? (
              <b>unsaved changes</b>
            ) : (
              <span className="muted">up to date</span>
            )}
          </span>
        </div>

        <div className="pager-right" style={{ gap: "0.75rem" }}>
          {flash && <span className="muted">{flash}</span>}
          <button className="button" type="button" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 260 }}>Setting</th>
            <th>Value</th>
            <th>Description</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td><b>color-threshold-pct</b></td>
            <td style={{ maxWidth: 260 }}>
              <input
                className="th-input"
                value={form.color_threshold_pct}
                onChange={(e) => setField("color_threshold_pct", e.target.value)}
                placeholder="1..50"
              />
            </td>
            <td className="muted">Minimum % for a detected color bucket to be suggested.</td>
          </tr>

          <tr>
            <td><b>min-saturation-pct</b></td>
            <td style={{ maxWidth: 260 }}>
              <input
                className="th-input"
                value={form.min_saturation_pct}
                onChange={(e) => setField("min_saturation_pct", e.target.value)}
                placeholder="0..100"
              />
            </td>
            <td className="muted">Below this saturation, pixels are treated as neutral (black/gray/white).</td>
          </tr>

          <tr>
            <td><b>neutral-lightness-split</b></td>
            <td style={{ maxWidth: 260 }}>
              <input
                className="th-input"
                value={form.neutral_lightness_split}
                onChange={(e) => setField("neutral_lightness_split", e.target.value)}
                placeholder="0..100"
              />
            </td>
            <td className="muted">Lightness split used for neutral bucketing.</td>
          </tr>

          <tr>
            <td><b>enable-auto-color-detection</b></td>
            <td>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={form.enable_auto_color_detection}
                  onChange={(e) => setField("enable_auto_color_detection", e.target.checked)}
                />
                <span>{form.enable_auto_color_detection ? "enabled" : "disabled"}</span>
              </label>
            </td>
            <td className="muted">If disabled, assign-tags page will not compute color suggestions.</td>
          </tr>
        </tbody>
      </table>

      <div className="muted" style={{ marginTop: "0.75rem" }}>
        Notes: values are stored globally in <code>app_settings</code>. Assign-tags will read these settings at runtime.
      </div>
    </main>
  );
}
