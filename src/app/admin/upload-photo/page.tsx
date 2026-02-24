export const dynamic = "force-dynamic";

import { Suspense } from "react";
import UploadPhotoClient from "./UploadPhotoClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="container">Loading...</div>}>
      <UploadPhotoClient />
    </Suspense>
  );
}