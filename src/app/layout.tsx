import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paved Apps",
  description: "Internal tools on the shared paved road.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
