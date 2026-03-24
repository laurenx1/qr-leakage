import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QR Leakage",
  description: "Visual encoding side-channel leakage — inferring payload properties without decoding",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
