import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: "2rem" }}>
      <h1 className="h1-display">🍺 Beer Cap Collection</h1>

      <p>
        Personal database of my beer cap collection.  
        Browse, catalog, and manage caps by country, trade type, and duplicates.
      </p>

      <nav style={{ marginTop: "1.5rem" }}>
        <ul style={{ listStyle: "none", padding: 0 }}>
          
        </ul>
      </nav>
    </main>
  );
}
