import type { Metadata, Viewport } from "next";
import { EB_Garamond, Figtree } from "next/font/google";
import "./globals.css";

const garamond = EB_Garamond({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-garamond" });
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-figtree" });

export const metadata: Metadata = {
  title: "Mirror — point a camera, get the answer",
  description: "Share a live camera or screen with a room. Anyone can ask AI for the answer to whatever is on it, in one tap.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f3f8f9",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${garamond.variable} ${figtree.variable}`}>
      <body>{children}</body>
    </html>
  );
}
