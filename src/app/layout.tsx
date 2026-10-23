import type { Metadata, Viewport } from "next";
import { Antonio, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

// Tall condensed caps, matching the type in the brand's posts.
const display = Antonio({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Hanken_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Dream Project",
  description: "Press and hold. A collective of creators, founders and entrepreneurs opens its doors soon.",
  openGraph: {
    title: "The Dream Project",
    description: "Press and hold. Something is waking up.",
    url: "https://www.thedreamproject.life",
    siteName: "The Dream Project",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0A08",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
