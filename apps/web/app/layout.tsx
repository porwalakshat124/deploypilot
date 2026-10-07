import type { Metadata } from "next";
import { SITE_URL } from "../lib/seo";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  verification: { google: "6FNBPxO2gyceVu54JNnvRsSzxw2bo23UQUdUp-swDuY" },
  title: { default: "DeployPilot | GitHub & Docker Deployment Dashboard", template: "%s | DeployPilot" },
  description: "Import GitHub repositories and deploy with your team's Docker workers. DeployPilot public beta.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
