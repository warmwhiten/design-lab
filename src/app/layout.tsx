import type { Metadata } from "next";
import { SITE } from "@/labs";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.title} · ${SITE.name}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  authors: [{ name: SITE.author }],
  alternates: { canonical: `${SITE.url}/` },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: "ko_KR",
    title: `${SITE.title} · ${SITE.name}`,
    description: SITE.description,
    url: SITE.url,
    images: [{ url: `${SITE.url}/og/default.png`, width: 1200, height: 630 }]
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.title} · ${SITE.name}`,
    description: SITE.description,
    images: [`${SITE.url}/og/default.png`]
  },
  robots: { index: true, follow: true }
};

const FONT_UI =
  "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=DM+Mono:wght@400;500&display=swap";
const FONT_ART =
  "https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Anton&family=Archivo+Black&family=Baloo+2:wght@800&family=Black+Han+Sans&family=Bowlby+One&family=Bungee&family=Fredoka:wght@700&family=Jua&family=Lilita+One&family=Titan+One&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_UI} />
        <link rel="stylesheet" href={FONT_ART} />
      </head>
      <body>{children}</body>
    </html>
  );
}
