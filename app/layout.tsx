import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { RealtimePlayerCountProvider } from "@/components/realtime-player-count-provider";
import { SessionTracker } from "@/components/session-tracker";
import { RoomProvider } from "@/components/room-provider";
import ToastProvider from "@/components/toast-provider";
import { Analytics } from "@vercel/analytics/react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Verbrawl",
  description: "Play Verbrawl, the ultimate multiplayer Wordle game. Challenge friends in a word duel, race against time, and brawl for the highest score. Free online word game.",
  keywords: ["wordle", "word duel", "word brawl", "multiplayer wordle", "word race", "word game", "online word game", "verbrawl", "squabble alternative"],
  icons: {
    icon: [
      { url: '/verbrawl.ico' },        // Standard favicon for search engines
      { url: '/verbrawl.svg' },        // SVG for high-quality display
    ],
    shortcut: '/verbrawl.ico',
    apple: '/verbrawl.svg',
  },
  openGraph: {
    title: "Verbrawl",
    description: "Play Verbrawl, the ultimate multiplayer Wordle game. Challenge friends in a word duel, race against time, and brawl for the highest score.",
    type: "website",
    url: "https://verbrawl.vercel.app",
    siteName: "Verbrawl",
  },
  twitter: {
    card: "summary_large_image",
    title: "Verbrawl",
    description: "Play Verbrawl, the ultimate multiplayer Wordle game. Challenge friends in a word duel, race against time, and brawl for the highest score.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <RoomProvider>
          <RealtimePlayerCountProvider>
            <ThemeProvider>
              {children}
              <SessionTracker />
            </ThemeProvider>
          </RealtimePlayerCountProvider>
        </RoomProvider>
        <ToastProvider />
        <Analytics />
      </body>
    </html>
  );
}
