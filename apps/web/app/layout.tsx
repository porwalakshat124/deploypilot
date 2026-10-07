import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "DeployPilot",
  description: "Import GitHub repositories and deploy with your team's Docker workers. DeployPilot public beta.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
