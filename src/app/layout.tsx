import "./globals.css";
import NavBar from "./NavBar";
import { Roboto } from "next/font/google";

const font = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});





export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={font.className}>

        <NavBar />
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
