import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/*
 * Fonts are bundled LOCALLY (src/app/fonts) instead of next/font/google:
 * the VPS build has no (or blocked) outbound access to Google Fonts, so a
 * next/font/google fetch fails the Docker build. Variable names keep the
 * --font-geist-* contract that globals.css / Tailwind rely on.
 */
const geistSans = localFont({
  src: [
    { path: "./fonts/Geist-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Geist-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Geist-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/Geist-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-geist-sans",
});

const geistMono = localFont({
  src: [
    { path: "./fonts/GeistMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/GeistMono-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/GeistMono-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/GeistMono-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Bodapp",
  description: "Wedding management & invitations",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}