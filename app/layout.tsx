import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { PwaRegistration } from "./pwa-registration";
import { THEME_STORAGE_KEY } from "./theme";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0f131b" },
  ],
  colorScheme: "light dark",
};

const themeInitializer = `(() => {
  try {
    const stored = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    const preference = stored === "light" || stored === "dark" ? stored : "system";
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    const theme = preference === "system" ? (prefersLight ? "light" : "dark") : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    // Keep the default System theme when browser storage or media queries are unavailable.
  }
})();`;

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const title = "Calocount — simple calorie tracking";
  const description = "Food and drink entries. Clear calorie and protein numbers.";

  return {
    metadataBase,
    title,
    description,
    applicationName: "Calocount",
    icons: {
      icon: [
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
        { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      shortcut: [{ url: "/favicon.ico", type: "image/x-icon" }],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      title: "Calocount",
      statusBarStyle: "black-translucent",
    },
    other: {
      "apple-mobile-web-app-capable": "yes",
    },
    openGraph: {
      title,
      description,
      images: [{ url: new URL("/og.png", metadataBase).href, width: 1200, height: 630 }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [new URL("/og.png", metadataBase).href],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script id="theme-initializer" dangerouslySetInnerHTML={{ __html: themeInitializer }} />
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
      </head>
      <body>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
