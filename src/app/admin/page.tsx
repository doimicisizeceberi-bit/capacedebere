import Link from "next/link";

type AdminLink = {
  href: string;
  title: string;
  desc?: string;
  icon: string;   // emoji
  tag?: string;   // small label on the right
};

const links: AdminLink[] = [
  { href: "/admin/add-cap", title: "Add a beer cap", desc: "Insert a new cap record.", icon: "➕", tag: "Admin" },
  { href: "/admin/upload-photo", title: "Upload photo", desc: "Upload new cap photos.", icon: "📸", tag: "Admin" },
  { href: "/admin/manage-barcodes", title: "Manage barcodes", desc: "Generate and print A0b stricker notes to label caps.", icon: "🔢", tag: "Admin" },

  { href: "/admin/edit-cap", title: "Edit a beer cap", desc: "Update existing caps by scanning barcodes.", icon: "✏️", tag: "Admin" },
  { href: "/admin/photo-audit", title: "Photo audit", desc: "Review/replace/remove missing/broken photos of existing caps.", icon: "🖼️", tag: "Admin" },
  { href: "/admin/duplicates", title: "Duplicates", desc: "View duplicates, clipboard-copy caps ids and barcodes.", icon: "🧬", tag: "Admin" },

  { href: "/admin/quick-edit", title: "Quick edit/remove a beer cap", desc: "Edit/remove caps without photos or barcodes.", icon: "⚡", tag: "Admin" },
  { href: "/admin/assign-tags", title: "Assign tags", desc: "Edit tags assigments. Run color scan to auto-generate color-tags.", icon: "🏷️", tag: "Admin" },
  { href: "/admin/trades", title: "Trades", desc: "Create/manage pending trades. Cancel or complete trades.", icon: "🔄", tag: "Admin" },

  { href: "/admin/delete-cap", title: "Delete a beer cap", desc: "Remove a cap record (advanced conditions may apply).", icon: "🗑️", tag: "Admin" },
  { href: "/admin/manage-tags", title: "Manage tags and types", desc: "Create/edit/delete tags and types. Assign tags to types.", icon: "🧩", tag: "Admin" },
  { href: "/admin/trade-caps", title: "Generate Trade Offer", desc: "Generate .pdf file containg doubles to initiate tradings.", icon: "🖨️", tag: "Admin" },

  { href: "/admin/stats", title: "Stats", desc: "Quick collection stats (under construction).", icon: "📊", tag: "Admin" },
  { href: "/admin/manage-countries", title: "Manage countries", desc: "Add/edit country list. Activate/deactivate country", icon: "🌍", tag: "Admin" },
  { href: "/admin/traders", title: "Traders", desc: "Add/edit/list cap traders.", icon: "🤝", tag: "Admin" },

  { href: "/admin/settings", title: "Settings and features", desc: "Configure advanced admin settings.", icon: "⚙️", tag: "Admin" },
  { href: "/admin/database", title: "Manage database", desc: "Restore/back-up database (under construction).", icon: "🗄️", tag: "Admin" },
  { href: "/admin/sources", title: "Beer-cap Sources", desc: "Add/edit/list sources.", icon: "👤", tag: "Admin" },
];

export default function AdminHome() {
  return (
    <>
      <h1 className="h1-display">🛠️ Admin panel</h1>
      <p className="h1-subtitle">Tools for managing the database (no advanced security yet).</p>

      <div className="admin-grid" style={{ marginTop: 18 }}>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="admin-card">
            <div className="admin-card-top">
              <div className="admin-card-title-row">
                <span className="admin-card-icon" aria-hidden="true">
                  {l.icon}
                </span>
                <div className="admin-card-title">{l.title}</div>
              </div>
            </div>

            {l.desc ? <div className="admin-card-desc">{l.desc}</div> : null}
          </Link>
        ))}
      </div>
    </>
  );
}