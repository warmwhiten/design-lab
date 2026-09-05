import type { Metadata } from "next";
import Link from "next/link";
import Woodcut from "@/labs/woodcut/Woodcut";
import Article from "./article.mdx";
import { getLab, SITE } from "@/labs";

const lab = getLab("woodcut")!;

export const metadata: Metadata = {
  title: lab.title,
  description: lab.description,
  keywords: lab.keywords,
  alternates: { canonical: `${SITE.url}/lab/${lab.slug}/` },
  openGraph: {
    type: "website",
    title: `${lab.title} · ${SITE.name}`,
    description: lab.description,
    url: `${SITE.url}/lab/${lab.slug}/`,
    images: [{ url: `${SITE.url}/og/${lab.slug}.png`, width: 1200, height: 630 }]
  },
  twitter: {
    card: "summary_large_image",
    title: `${lab.title} · ${SITE.name}`,
    description: lab.description,
    images: [`${SITE.url}/og/${lab.slug}.png`]
  }
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: lab.title,
  description: lab.description,
  url: `${SITE.url}/lab/${lab.slug}/`,
  applicationCategory: "DesignApplication",
  operatingSystem: "Web",
  browserRequirements: "Requires JavaScript and HTML5 canvas",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
  author: { "@type": "Person", name: SITE.author }
};

export default function Page() {
  return (
    <div className="lab-page">
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Woodcut />
      <section className="article">
        <div className="article-in"><Article /></div>
        <nav className="article-nav">
          <Link className="btn" href="/">← 다른 실험 보기</Link>
          <a className="btn" href="https://github.com/warmwhiten/design-lab">소스 코드</a>
        </nav>
      </section>
    </div>
  );
}
