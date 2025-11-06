import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { RealtimePlayerCountProvider } from "@/components/realtime-player-count-provider";
import { SessionTracker } from "@/components/session-tracker";
import { RoomProvider } from "@/components/room-provider";

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
  description: "A Wordle-inspired game with time limits and race modes",
  icons: {
    icon: '/verbrawl.svg',
    shortcut: '/verbrawl.svg',
    apple: '/verbrawl.svg',
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
      </body>
    </html>
  );
}
