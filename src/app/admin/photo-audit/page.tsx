"use client";

import { useEffect, useState } from "react";
import { useRef } from "react"; // add at top with other imports


type Cap = {
  id: number;
  beer_name: string;
  cap_no: number;
  sheet: string | null;
  caps_country: { country_name_full: string; country_name_abb: string } | null;
  photo_caps: { photo_path: string } | null;
};

export default function PhotoAuditPage() {
  const [totalCaps, setTotalCaps] = useState<number>(0);
  const [missingPhotos, setMissingPhotos] = useState<number>(0);

  const [idInput, setIdInput] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const [cap, setCap] = useState<Cap | null>(null);
  const [msg, setMsg] = useState<string>("");

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

	const capIdInputRef = useRef<HTMLInputElement | null>(null);

	const [seriesIdInput, setSeriesIdInput] = useState<string>("");
	const [seriesCaps, setSeriesCaps] = useState<any[]>([]);
	const [seriesLoading, setSeriesLoading] = useState(false);
	const [seriesMsg, setSeriesMsg] = useState("");

  // used to bust cache after replacement
  const [cacheBust, setCacheBust] = useState<number>(Date.now());


	const fetchSeriesById = async () => {
	  setSeriesMsg("");
	  setSeriesCaps([]);

	  const id = Number(seriesIdInput);
	  if (!Number.isInteger(id) || id < 1) {
		setSeriesMsg("Enter a valid numeric id.");
		return;
	  }

	  setSeriesLoading(true);
	  try {
		const res = await fetch(`/api/admin/photo-audit/series-by-id?id=${id}`, { cache: "no-store" });
		const json = await res.json();

		if (!res.ok) {
		  setSeriesMsg(json?.error || "Not found.");
		  return;
		}

		setSeriesCaps(json.caps || []);
	  } catch (e: any) {
		console.error(e);
		setSeriesMsg(e?.message || "Failed to fetch series.");
	  } finally {
		setSeriesLoading(false);
	  }
	};




  useEffect(() => {
    const loadSummary = async () => {
      try {
        const res = await fetch("/api/admin/photo-audit/summary", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load summary");
        setTotalCaps(json.total_caps ?? 0);
        setMissingPhotos(json.missing_photos ?? 0);
      } catch (e: any) {
        console.error(e);
      }
    };
    loadSummary();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewUrl(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const fetchById = async () => {
    setMsg("");
    setCap(null);
    setFile(null);

    const id = Number(idInput);
    if (!Number.isInteger(id) || id < 1) {
      setMsg("Enter a valid numeric id.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/photo-audit/by-id?id=${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json?.error || "Not found.");
        return;
      }
      setCap(json.cap);
      setCacheBust(Date.now());
    } catch (e: any) {
      console.error(e);
      setMsg(e?.message || "Failed to fetch cap.");
    } finally {
      setLoading(false);
    }
  };

  const doReplace = async () => {
    setMsg("");

    if (!cap) return setMsg("Search a cap first.");
    if (!file) return setMsg("Choose an image first.");

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("capId", String(cap.id));
      fd.append("file", file);

      const res = await fetch("/api/admin/photo-audit/replace", {
        method: "POST",
        body: fd,
      });

      const json = await res.json();
      if (!res.ok) {
        setMsg(json?.error || "Replace failed.");
        return;
      }

      setMsg(`Updated photo: ${json.filename}`);
      setCacheBust(json.bust || Date.now());
      setFile(null);

      // refresh cap row (so photo_path text updates)
      await fetchById();

      // refresh summary (missing count may change)
      const sumRes = await fetch("/api/admin/photo-audit/summary", { cache: "no-store" });
      const sumJson = await sumRes.json();
      if (sumRes.ok) {
        setTotalCaps(sumJson.total_caps ?? totalCaps);
        setMissingPhotos(sumJson.missing_photos ?? missingPhotos);
      }
    } catch (e: any) {
      console.error(e);
      setMsg(e?.message || "Unexpected error.");
    } finally {
      setBusy(false);
    }
  };

  const doDeletePhoto = async () => {
    setMsg("");

    if (!cap) return setMsg("Search a cap first.");
    if (!cap.photo_caps?.photo_path) return setMsg("This cap has no photo to delete.");

    const ok = window.confirm(
      `Delete photo for cap ID ${cap.id}?\n\nThis will remove the DB row and delete the storage file.`
    );
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch("/api/admin/photo-audit/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capId: cap.id }),
      });

      const json = await res.json();
      if (!res.ok) {
        setMsg(json?.error || "Delete failed.");
        return;
      }

      if (json.alreadyMissing) {
        setMsg("No photo row found (already missing).");
      } else {
        setMsg(`Deleted photo: ${json.deletedPath || "(unknown path)"}`);
      }

      setPreviewUrl(null);
      setFile(null);
      setCacheBust(json.bust || Date.now());

      // refresh cap row (photo_path text + thumbnail updates)
      await fetchById();

      // refresh summary (missing count likely changes)
      const sumRes = await fetch("/api/admin/photo-audit/summary", { cache: "no-store" });
      const sumJson = await sumRes.json();
      if (sumRes.ok) {
        setTotalCaps(sumJson.total_caps ?? totalCaps);
        setMissingPhotos(sumJson.missing_photos ?? missingPhotos);
      }
    } catch (e: any) {
      console.error(e);
      setMsg(e?.message || "Unexpected error.");
    } finally {
      setBusy(false);
    }
  };


	const hasPhoto = !!cap?.photo_caps?.photo_path;
	const actionLabel = hasPhoto ? "Replace photo" : "Upload photo";

	const seriesTitle =
	  seriesCaps.length > 0
		? [
			seriesCaps[0]?.beer_name || "",
			seriesCaps[0]?.caps_country?.country_name_full || "",
		  ].filter(Boolean).join(" — ")
		: "";


	const imgUrl =
		cap?.photo_caps?.photo_path
		  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/beer-caps/${cap.photo_caps.photo_path}?v=${cacheBust}`
		  : null;

  return (
    <>
      <h1>Photo audit</h1>

      <div className="audit-summary">
        <div className="stat-card">
          <div className="stat-label">Total caps</div>
          <div className="stat-value">{totalCaps}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Missing photos</div>
          <div className="stat-value">{missingPhotos}</div>
        </div>
      </div>

      <div className="form">
        <div className="field">
          <label>Search by cap ID</label>
          <div className="actions">
            <input
			
			ref={capIdInputRef}
			className="input"
			value={idInput}
              onChange={(e) => setIdInput(e.target.value)}
              placeholder="e.g. 123"
              inputMode="numeric"
              onKeyDown={(e) => {
                if (e.key === "Enter") fetchById();
              }}
            />
            <button className="button" type="button" onClick={fetchById} disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
          {msg && <div className="help" style={{ color: "crimson" }}>{msg}</div>}
        </div>
		
		
		<div className="field" style={{ marginTop: 14 }}>
		  <label>Search by series overview ID</label>
		  <div className="actions">
			<input
			  className="input"
			  value={seriesIdInput}
			  onChange={(e) => setSeriesIdInput(e.target.value)}
			  placeholder="e.g. 123"
			  inputMode="numeric"
			  onKeyDown={(e) => {
				if (e.key === "Enter") fetchSeriesById();
			  }}
			/>
			<button className="button" type="button" onClick={fetchSeriesById} disabled={seriesLoading}>
			  {seriesLoading ? "Loading..." : "Show series"}
			</button>
		  </div>
		  {seriesMsg && <div className="help" style={{ color: "crimson" }}>{seriesMsg}</div>}
		</div>
		
		{seriesCaps.length > 0 && (
		  <>
			<div className="series-header">
			  <div className="series-title">{seriesTitle}</div>
			  <div className="series-subtitle">
				Showing <b>{seriesCaps.length}</b> caps in this series (click a tile to set the ID above).
			  </div>
			</div>

		  </>
		)}
		
		
		{seriesCaps.length > 0 && (
		  <div className="series-grid">
			{seriesCaps.map((c: any) => {
			  const photoPath = c.photo_caps?.photo_path || null;
			  const url = photoPath
				? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/beer-caps/${photoPath}`
				: null;

			  return (
				<div
				  key={c.id}
				  className="series-tile"
				  onClick={() => {
					// ✅ clicking the tile sets the cap-id search field value
					setIdInput(String(c.id));
					// optional: put cursor there (nice UX)
					capIdInputRef.current?.focus();
				  }}
				>
				  {url ? (
					<img
					  className="thumb"
					  src={url}
					  alt="cap"
					  style={{ cursor: "zoom-in" }}
					  onClick={(e) => {
						// keep existing modal preview behavior
						e.stopPropagation(); // don't overwrite the id input when zooming
						setPreviewUrl(url);
					  }}
					/>
				  ) : (
					<div className="thumb-placeholder">No photo</div>
				  )}

				  <div className="series-id">ID: {c.id}</div>
				</div>
			  );
			})}
		  </div>
		)}
		
      </div>

      {cap && (
        <>
          <table className="table" style={{ marginTop: 18 }}>
            <thead>
              <tr>
				<th>ID</th>
                <th>Beer name</th>
                <th>Cap no</th>
                <th>Country</th>
                <th>Sheet</th>
                <th>Photo</th>
              </tr>
            </thead>

            <tbody>
              <tr>
				<td>{cap.id}</td>
                <td>{cap.beer_name}</td>
                <td>{cap.cap_no}</td>
                <td>{cap.caps_country?.country_name_full ?? "-"}</td>
                <td>{cap.sheet ?? "-"}</td>
                <td>
                  {imgUrl ? (
                    <img
                      className="thumb"
                      src={imgUrl}
                      alt="cap"
                      style={{ cursor: "zoom-in" }}
                      onClick={() => setPreviewUrl(imgUrl)}
                    />
                  ) : (
                    <div className="thumb-placeholder">No photo</div>
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="mono" style={{ marginTop: 8 }}>
            Current photo_path:{" "}
            <b>{cap.photo_caps?.photo_path ?? "— (no row in photo_caps)"}</b>
          </div>

          <div className="audit-actions">
            <div className="field">
              <label>{actionLabel}</label>
              <input
                className="input"
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <div className="help">
                This will upload a new file, update <b>photo_caps</b>, and delete the old file (if different).
              </div>
            </div>

            <div className="actions">
              <button className="button" type="button" onClick={doReplace} disabled={busy}>
                {busy ? "Working..." : actionLabel}
              </button>

              <button
                className="button"
                type="button"
                onClick={doDeletePhoto}
                disabled={busy || !hasPhoto}
                title={!hasPhoto ? "This cap has no photo" : "Delete photo (DB row + storage file)"}
              >
                {busy ? "Working..." : "Delete photo"}
              </button>

              {msg && (
                <span style={{ color: msg.startsWith("Updated") || msg.startsWith("Deleted") ? "green" : "crimson" }}>
                  {msg}
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {previewUrl && (
        <div className="modal-overlay" onClick={() => setPreviewUrl(null)} role="dialog" aria-modal="true">
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setPreviewUrl(null)} aria-label="Close">
              ✕
            </button>
            <img className="modal-image" src={previewUrl} alt="Full size cap" />
          </div>
        </div>
      )}
    </>
  );
}
