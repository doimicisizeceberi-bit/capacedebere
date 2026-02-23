/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ✅ Fix PDFKit "Helvetica.afm" ENOENT by preventing bundling on the server
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
