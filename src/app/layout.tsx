import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Student Project Tracker",
  description: "Track student projects and tasks, and run them through mentor review.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
