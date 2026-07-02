import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CleiaDog } from "@/components/CleiaDog";
import { BlinkReveal } from "@/components/BlinkReveal";
import { SparkleTrail } from "@/components/SparkleTrail";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SquishyGPT - Serena's Optometry Brain",
  description:
    "A private RAG chat over Serena's optometry study sets. Ask anything, by text or voice.",
  appleWebApp: {
    capable: true,
    title: "SquishyGPT",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#ec4899",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <BlinkReveal />
        {children}
        <CleiaDog />
        <SparkleTrail />
      </body>
    </html>
  );
}
