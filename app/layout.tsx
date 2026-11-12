import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asystent Stan Naturalny",
  description: "Czat i analiza wiadomości z asystentem Stan Naturalny.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pl"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: `try {
          const theme = localStorage.getItem("studio-nova-theme");
          if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
        } catch {}` }} />
        {children}
      </body>
    </html>
  );
}
