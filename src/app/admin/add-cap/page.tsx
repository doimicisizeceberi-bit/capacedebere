"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { TypeaheadSelect, TypeaheadOption } from "@/components/TypeaheadSelect";

type CountryRow = {
  id: number;
  country_name_full: string;
  country_name_abb: string;
  caps_count: number;
};

type SourceRow = {
  id: number;
  source_name: string;
  is_trader: boolean;
  source_country: {
    country_name_full: string;
    country_name_abb: string;
  } | null;
  details: string | null;
};

const TRADE_TYPES = [
  "blind_trade",
  "exotic_trade",
  "scan_trade",
  "blind_ro",
  "scan_ro",
] as const;

const TOP_COUNTRY_LIMIT = 5; // change to 20 later

export default function AddCapPage() {
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);

  // keep feature, but OFF by default
  const [topOnly, setTopOnly] = useState(false);

  // selected country via TypeaheadSelect
  const [country, setCountry] = useState<TypeaheadOption | null>(null);
  const countryId = country?.id ?? null;

  // selected source via TypeaheadSelect (REQUIRED)
  const [sourceOpt, setSourceOpt] = useState<TypeaheadOption | null>(null);
  const sourceId = sourceOpt?.id ?? null;

  const [beerName, setBeerName] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSug, setShowSug] = useState(false);

  const [capNo, setCapNo] = useState<number>(1);
  const [sheet, setSheet] = useState<string>("");
  const [tradeType, setTradeType] =
    useState<(typeof TRADE_TYPES)[number]>("scan_trade");
  const [issuedYear, setIssuedYear] = useState<string>("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const [successOpen, setSuccessOpen] = useState(false);
  const router = useRouter();

  const [newCapId, setNewCapId] = useState<number | null>(null);

  const debounceRef = useRef<number | null>(null);

  // Load countries + counts (from your route)
  useEffect(() => {
    const load = async () => {
      setMsg("");
      try {
        const res = await fetch("/api/countries-caps", { cache: "no-store" });
        const text = await res.text(); // read raw

        if (!res.ok) {
          console.error("countries-caps failed:", res.status, res.statusText, text);
          setMsg(`Failed to load countries (${res.status}).`);
          return;
        }

        const json = JSON.parse(text);
        setCountries(json.data || []);
      } catch (e) {
        console.error("countries-caps network/parse error:", e);
        setMsg("Failed to load countries.");
      }
    };

    load();
  }, []);

  // Load sources (anon read; meta shows ABB — Full + Trader)
  useEffect(() => {
    const loadSources = async () => {
      try {
        const { data, error } = await supabase
          .from("caps_sources")
          .select(
            `
            id,
            source_name,
            is_trader,
            details,
            source_country (
              country_name_full,
              country_name_abb
            )
          `
          )
          .order("source_name", { ascending: true });

        if (error) {
          console.error(error);
          setMsg("Failed to load sources.");
          return;
        }

        setSources((data as any) || []);
      } catch (e) {
        console.error(e);
        setMsg("Failed to load sources.");
      }
    };

    loadSources();
  }, []);

  const countriesWithCapsCount = useMemo(() => {
    return countries.filter((c) => (c.caps_count ?? 0) > 0).length;
  }, [countries]);

  // countries already come ordered by caps_count desc from the API route
  const countriesForPicker = useMemo(() => {
    if (!topOnly) return countries;
    return [...countries].slice(0, TOP_COUNTRY_LIMIT);
  }, [countries, topOnly]);

  const countryOptions: TypeaheadOption[] = useMemo(() => {
    return countriesForPicker.map((c) => ({
      id: c.id,
      label: c.country_name_full,
      meta: `${c.country_name_abb} — ${c.caps_count ?? 0}`,
    }));
  }, [countriesForPicker]);

  const sourceOptions: TypeaheadOption[] = useMemo(() => {
    return sources.map((s) => {
      const abb = s.source_country?.country_name_abb ?? "—";
      const full = s.source_country?.country_name_full ?? "—";
      const trader = s.is_trader ? " — Trader" : "";
      return {
        id: s.id,
        label: s.source_name,
        meta: `${abb} — ${full}${trader}`,
      };
    });
  }, [sources]);

  // Fetch suggestions (debounced) when typing beer name AND country chosen
  useEffect(() => {
    setMsg("");

    if (!countryId) {
      setSuggestions([]);
      setShowSug(false);
      return;
    }

    const q = beerName.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setShowSug(false);
      return;
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(async () => {
      const { data, error } = await supabase
        .from("beer_caps")
        .select("beer_name")
        .eq("cap_country", countryId)
        .ilike("beer_name", `${q}%`)
        .order("beer_name", { ascending: true })
        .limit(15);

      if (error) {
        console.error(error);
        setSuggestions([]);
        setShowSug(false);
        return;
      }

      const uniq = Array.from(
        new Set((data || []).map((r: any) => String(r.beer_name)))
      ).slice(0, 10);

      setSuggestions(uniq);
      setShowSug(true);
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [beerName, countryId]);

  const capNoExists = async (country: number, name: string, no: number) => {
    const { data, error } = await supabase
      .from("beer_caps")
      .select("id")
      .eq("cap_country", country)
      .eq("beer_name", name.trim())
      .eq("cap_no", no)
      .limit(1);

    if (error) {
      console.error(error);
      // If we can’t verify, safest is to block insert
      return { exists: true, err: "Could not validate cap_no uniqueness." };
    }

    return { exists: (data?.length ?? 0) > 0, err: "" };
  };

  const computeNextCapNo = async (country: number, name: string) => {
    const clean = name.trim();
    if (!clean) return;

    const { data, error } = await supabase
      .from("beer_caps")
      .select("cap_no")
      .eq("cap_country", country)
      .eq("beer_name", clean)
      .order("cap_no", { ascending: false })
      .limit(1);

    if (error) {
      console.error(error);
      return;
    }

    const maxNo = data?.[0]?.cap_no ?? 0;
    setCapNo(maxNo + 1);
  };

  const selectSuggestion = async (name: string) => {
    setBeerName(name);
    setShowSug(false);
    if (countryId) await computeNextCapNo(countryId, name);
  };

  const onBeerNameBlur = async () => {
    window.setTimeout(() => setShowSug(false), 150);

    if (countryId) {
      const clean = beerName.trim();
      if (clean) await computeNextCapNo(countryId, clean);
    }
  };

  const onSubmit = async () => {
    setMsg("");

    if (!countryId) return setMsg("Please select a country.");
    if (!sourceId) return setMsg("Please select a source.");

    const cleanBeer = beerName.trim();
    if (!cleanBeer) return setMsg("Beer name is required.");

    if (!Number.isInteger(capNo) || capNo < 1)
      return setMsg("cap_no must be a positive integer.");

    // prevent duplicate cap_no for same country + beer_name
    const check = await capNoExists(countryId, cleanBeer, capNo);
    if (check.exists) {
      setMsg(
        check.err ||
          `Cap no ${capNo} already exists for "${cleanBeer}" in this country.`
      );
      return;
    }

    const yearVal =
      issuedYear.trim() === "" ? null : Number.parseInt(issuedYear.trim(), 10);

    if (
      yearVal !== null &&
      (!Number.isFinite(yearVal) || issuedYear.trim().length !== 4)
    ) {
      return setMsg("Issued year must be 4 digits (or empty).");
    }

    setBusy(true);
    try {
      // ✅ server-only write
      const res = await fetch("/api/admin/add-cap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beer_name: cleanBeer,
          cap_no: capNo,
          cap_country: countryId,
          sheet: sheet.trim() === "" ? null : sheet.trim(),
          trade_type: tradeType,
          issued_year: yearVal,
          source: sourceId,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setMsg(json?.error || `Save failed (${res.status}).`);
        return;
      }

      setNewCapId(json.id);

      setMsg("");
      setSuccessOpen(true);

      setBeerName("");
      setSuggestions([]);
      setShowSug(false);
      setCapNo(1);
      setSheet("");
      setIssuedYear("");
      setTradeType("scan_trade");
      setSourceOpt(null); // no default
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="h1-display">➕ Add beer cap</h1>
      <p className="h1-subtitle">
        Pick country → pick source → type beer name (with suggestions) → cap no auto-increments.
      </p>

      <div className="form form-narrow">
        {/* Top countries toggle */}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={topOnly}
            onChange={(e) => setTopOnly(e.target.checked)}
          />
          Show only top {TOP_COUNTRY_LIMIT} countries (
          {Math.min(TOP_COUNTRY_LIMIT, countriesWithCapsCount)} of{" "}
          {countriesWithCapsCount})
        </label>

        <div className="form-grid-2">
          {/* LEFT column */}
          <div className="form-panel">
            <div className="form-panel-title">Lookup</div>

            <div className="form-stack">
              {/* Country (TypeaheadSelect) */}
              <div className="field">
                <label>Country</label>

                <TypeaheadSelect
                  options={countryOptions}
                  value={country}
                  onChange={(opt) => {
                    setCountry(opt);

                    // reset dependent fields (same behavior as before)
                    setBeerName("");
                    setSuggestions([]);
                    setShowSug(false);
                    setCapNo(1);
                    setMsg("");
                  }}
                  placeholder="Type 2+ chars…"
                  minChars={2}
                  maxResults={12}
                  inputClassName="select" // reuse your existing select styling
                />
              </div>

              {/* Source (TypeaheadSelect) */}
              <div className="field">
				<label>
				  Source <span className="label-meta">(required)</span>
				</label>

                <TypeaheadSelect
                  options={sourceOptions}
                  value={sourceOpt}
                  onChange={(opt) => {
                    setSourceOpt(opt);
                    setMsg("");
                  }}
                  placeholder="Type 2+ chars…"
                  minChars={2}
                  maxResults={12}
                  inputClassName="select"
                  allowCreate={false}
                />
              </div>

              {/* Beer name + suggestions */}
              <div className="field sug-wrap">
                <label>Beer name</label>
                <input
                  className="input"
                  value={beerName}
                  disabled={!countryId}
                  onChange={(e) => setBeerName(e.target.value)}
                  onFocus={() => {
                    if (suggestions.length) setShowSug(true);
                  }}
                  onBlur={onBeerNameBlur}
                  placeholder={countryId ? "Type at least 2 letters…" : "Select country first"}
                />

                {showSug && suggestions.length > 0 && (
                  <div className="sug-box">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="sug-item"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectSuggestion(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT column */}
          <div className="form-panel">
            <div className="form-panel-title">Details</div>

            <div className="form-stack">
              {/* cap_no */}
              <div className="field">
				<label>
				  Cap no <span className="label-meta">(auto)</span>
				</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={capNo}
                  onChange={(e) => setCapNo(Number(e.target.value))}
                />
                <div className="help">
                  For: {country?.label ?? "—"} / {beerName.trim() || "—"}
                </div>
              </div>

              {/* Sheet */}
              <div className="field">
                <label>Sheet</label>
                <input
                  className="input"
                  value={sheet}
                  onChange={(e) => setSheet(e.target.value)}
                  placeholder="e.g. GER-13"
                />
              </div>

              {/* Trade type */}
              <div className="field">
                <label>Trade type</label>
                <select
                  className="select"
                  value={tradeType}
                  onChange={(e) => setTradeType(e.target.value as any)}
                >
                  {TRADE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Year */}
              <div className="field">
				<label>
				  Issued year <span className="label-meta">(optional)</span>
				</label>
                <input
                  className="input"
                  value={issuedYear}
                  onChange={(e) => setIssuedYear(e.target.value)}
                  placeholder="e.g. 2021"
                  inputMode="numeric"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="button" onClick={onSubmit} disabled={busy}>
            {busy ? "Saving..." : "Save cap"}
          </button>

          {msg && (
            <span style={{ color: msg.startsWith("Saved!") ? "green" : "crimson" }}>
              {msg}
            </span>
          )}
        </div>
      </div>

      {successOpen && (
        <div className="modal-overlay" onClick={() => setSuccessOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>✅ Success</h2>
            <p>Beer cap successfully added to collection.</p>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button className="button" type="button" onClick={() => setSuccessOpen(false)}>
                OK
              </button>

              <button
                className="button"
                type="button"
                onClick={() => {
                  setSuccessOpen(false);
                  router.push("/caps");
                }}
              >
                View caps
              </button>

              <button
                className="button"
                type="button"
                onClick={() => {
                  setSuccessOpen(false);
                  router.push(`/admin/upload-photo?id=${newCapId}`);
                }}
              >
                Add photo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}