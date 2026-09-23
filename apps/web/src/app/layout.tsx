import type { Metadata } from "next";
import { tokens } from "@season/ui-tokens";
import "./globals.css";

export const metadata: Metadata = {
  title: `${tokens.brand} | Tournament management`,
  description: "Season brings your tournament together. Schedules, teams, competition, and game-day operations.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: '(() => { const param = new URLSearchParams(window.location.search).get("clawpilotTheme"); const theme = param || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); document.documentElement.setAttribute("data-theme", theme); })();' }} /></head>
      <body>{children}</body>
    </html>
  );
}
