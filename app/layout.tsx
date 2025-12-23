import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { StarknetProvider } from "@/providers/StarknetProvider";

export const metadata: Metadata = {
  title: "Loot Survivor Referral Tracker",
  description: "Track referrals for Loot Survivor on Starknet",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>
        <StarknetProvider>{children}</StarknetProvider>
      </body>
    </html>
  );
}

