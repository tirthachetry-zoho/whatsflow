import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Freebuff Desktop — WhatsApp Business Workflow Platform",
  description: "AI-powered WhatsApp Business automation with visual workflow builder, powered by OpenWA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
