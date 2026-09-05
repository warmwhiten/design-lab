import Link from "next/link";
import type { Metadata } from "next";
import { LABS, SITE } from "@/labs";

export const metadata: Metadata = {
  title: `${SITE.title} · ${SITE.name}`,
  description: SITE.description,
  alternates: { canonical: `${SITE.url}/` }
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: `${SITE.title} · ${SITE.name}`,
  description: SITE.description,
  url: SITE.url,
  hasPart: LABS.filter((l) => l.status === "live").map((l) => ({
    "@type": "WebApplication",
    name: l.title,
    description: l.description,
    url: `${SITE.url}/lab/${l.slug}/`,
    applicationCategory: "DesignApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" }
  }))
};

export default function Home() {
  return (
    <div className="page">
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="hero">
        <div className="hero-in">
          <p className="eyebrow"><span className="dot" />{SITE.author} / {SITE.name}</p>
          <h1 className="page-t">{SITE.title}</h1>
          <p className="lede">
            브라우저에서 바로 돌려보는 작은 도구들. 파라미터를 슬라이더로 만지면 결과가 즉시 바뀌고,
            만든 조합은 주소창 링크 그대로 공유됩니다. 각 실험은 <code>src/app/lab/&lt;slug&gt;/</code> 하나로
            독립돼 있고 공통 셸(<code>LabShell</code>)을 함께 씁니다.
          </p>
        </div>
      </header>

      <main>
        <div className="grid">
          {LABS.map((L) => {
            const live = L.status === "live";
            const inner = (
              <>
                <div className="card-top">
                  <svg viewBox="0 0 64 64" aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: L.mark }} />
                  <span className={`status ${L.status}`}>{live ? "열림" : "준비 중"}</span>
                </div>
                <h2 className="card-t">{L.title}</h2>
                <p className="card-d">{L.tagline}</p>
                <div className="tags">
                  {L.tags.map((t) => <span className="tag" key={t}>{t}</span>)}
                </div>
              </>
            );
            return live
              ? <Link className="card" key={L.slug} href={`/lab/${L.slug}/`}>{inner}</Link>
              : <div className="card soon" key={L.slug}>{inner}</div>;
          })}
        </div>
      </main>

      <footer className="foot">
        <div className="foot-in">
          <span>© {new Date().getFullYear()} {SITE.author}</span>
          <a href="https://github.com/warmwhiten/design-lab">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
