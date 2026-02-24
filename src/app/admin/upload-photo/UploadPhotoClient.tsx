"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useSearchParams } from "next/navigation";

type CapPick = {
  id: number;
  beer_name: string;
  cap_no: number;
  caps_country: { country_name_abb: string } | null;
  photo_caps?: { beer_cap_id: number }[] | null;
};


function slugBeerNameKeepCase(name: string) {
  return name
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^A-Za-z0-9]+/g, "-")  // spaces/symbols -> hyphen
    .replace(/-+/g, "-")             // collapse hyphens
    .replace(/^-|-$/g, "");          // trim hyphens
}


export default function UploadPhotoPage() {
	const sp = useSearchParams();
	const initialId = sp?.get("id");

  const [caps, setCaps] = useState<CapPick[]>([]);
  const [capId, setCapId] = useState<number | "">(initialId ? Number(initialId) : "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const load = async () => {
	const { data, error } = await supabase
	  .from("beer_caps")
	  .select(`
		id,
		beer_name,
		cap_no,
		caps_country ( country_name_abb ),
		photo_caps ( beer_cap_id )
	  `)
	  .is("photo_caps", null)
	  .order("id", { ascending: false })
	  .limit(200);


      if (error) {
        console.error(error);
        setMsg("Failed to load caps.");
        return;
      }
      setCaps((data as any) || []);
    };

    load();
  }, []);

  const selectedCap = useMemo(() => {
    if (typeof capId !== "number") return null;
    return caps.find((c) => c.id === capId) || null;
  }, [capId, caps]);

  // ✅ New naming: beer_name-cap_no-country_abb.ext
  const suggestedBaseName = useMemo(() => {
    if (!selectedCap || !selectedCap.caps_country?.country_name_abb) return "";
	const beer = slugBeerNameKeepCase(selectedCap.beer_name);
    const abb = selectedCap.caps_country.country_name_abb;
    return `${beer}-${selectedCap.cap_no}-${abb}`;
  }, [selectedCap]);

		const onUpload = async () => {
		  setMsg("");

		  if (typeof capId !== "number") {
			setMsg("Select a cap first.");
			return;
		  }
		  if (!file) {
			setMsg("Choose an image file first.");
			return;
		  }
		  if (!selectedCap) {
			setMsg("Cap not found (try refresh).");
			return;
		  }
		  if (!selectedCap.caps_country?.country_name_abb) {
			setMsg("Missing country ABB for cap.");
			return;
		  }

		  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
		  const filename = `${suggestedBaseName}.${ext}`;

		  setBusy(true);
		  try {
			const fd = new FormData();
			fd.append("capId", String(capId));
			fd.append("filename", filename);
			fd.append("file", file);

			const res = await fetch("/api/admin/upload-photo", {
			  method: "POST",
			  body: fd,
			});

			const json = await res.json();

			if (!res.ok) {
			  setMsg(json?.error || "Upload failed");
			  return;
			}

			setMsg(`Uploaded + linked: ${json.filename}`);
			setFile(null);
		  } catch (err: any) {
			console.error(err);
			setMsg(err?.message || "Unexpected error during upload.");
		  } finally {
			setBusy(false);
		  }
		};


  return (
    <>
      <h1>Upload photo</h1>
		<p style={{ color: "var(--muted)", marginTop: 6 }}>
		  Select a cap → choose image → upload. This updates Storage + photo_caps.
		  <br />
		  There are <b>{caps.length}</b> caps for which photos are missing.
		</p>
      <div className="form">
        <div className="field">
          <label>Cap</label>
          <select
            className="select"
            value={capId}
            onChange={(e) => {
              const v = e.target.value;
              setCapId(v === "" ? "" : Number(v));
              setMsg("");
            }}
          >
			<option value="">Select a cap… (missing photos only)</option>
            {caps.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.id} — {c.beer_name} / {c.cap_no} / {c.caps_country?.country_name_abb ?? "?"}
              </option>
            ))}
          </select>

          {suggestedBaseName && (
            <div className="help">
              Filename will be: <b>{suggestedBaseName}.ext</b>
            </div>
          )}
        </div>

        <div className="field">
          <label>Image file</label>
          <input
            className="input"
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="actions">
          <button className="button" type="button" onClick={onUpload} disabled={busy}>
            {busy ? "Uploading..." : "Upload"}
          </button>

          {msg && (
            <span style={{ color: msg.startsWith("Uploaded") ? "green" : "crimson" }}>
              {msg}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
