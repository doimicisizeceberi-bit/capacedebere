import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="container">Loading...</div>}>
      <LoginClient />
    </Suspense>
  );
}