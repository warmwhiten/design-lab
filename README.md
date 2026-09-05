# design-lab

브라우저에서 바로 돌려보는 작은 인터랙티브 디자인 도구 모음.
파라미터를 슬라이더로 만지면 결과가 즉시 바뀌고, 만든 조합은 주소창 링크 그대로 공유된다.

🔗 https://warmwhiten.github.io/design-lab/

Next.js (App Router) · TypeScript · MDX · pnpm · GitHub Pages 정적 배포.

## 시작하기

```bash
pnpm install
pnpm dev          # http://localhost:3000/design-lab
pnpm build        # out/ 에 정적 파일 생성
pnpm typecheck
```

`pnpm install` 이 만드는 `pnpm-lock.yaml` 은 **커밋해야 한다** — CI 가 `--frozen-lockfile` 로 설치한다.

로컬에서 basePath 없이 보고 싶으면 `BASE_PATH= pnpm dev`.

## 구조

```
src/
  labs.ts                      실험실 목록 — 갤러리 · 상단 메뉴 · sitemap 이 이 배열 하나를 읽는다
  app/
    layout.tsx                 폰트 · 사이트 전역 메타데이터
    page.tsx                   갤러리 (CollectionPage JSON-LD)
    globals.css                공통 토큰 · 레일 · 스테이지 · 아티클 스타일
    sitemap.ts / robots.ts     정적 생성
    lab/framefit/
      page.tsx                 메타데이터 + 도구 + 설명 글
      article.mdx              "이게 어떻게 동작하는가"
  components/LabShell.tsx      공통 셸 (컨트롤 자동 생성 · URL 동기화 · 내보내기)
  labs/framefit/
    engine.ts                  프레임 · 워프 · 마스크 · 합성 (React 무관)
    svg.ts                     마칭 스퀘어 → SVG
    config.ts                  기본값 · 프리셋
    Framefit.tsx               'use client' 캔버스 컴포넌트
public/og/                     OG 이미지
.github/workflows/deploy.yml   Pages 배포
```

## 공통 셸

각 실험실은 컨트롤을 **선언형 스펙**으로 넘기고, 셸이 DOM · URL · 내보내기를 처리한다.
상태는 실험실이 소유하는 컨트롤드 컴포넌트다.

```tsx
<LabShell<MyState>
  slug="framefit" title="…" tagline="…"
  defaults={DEFAULTS} state={state} onChange={onChange}
  groups={[
    { label: "프레임", controls: [
      { t: "icons", k: "frame", options: FRAME_OPTS },
      { t: "range", k: "weight", label: "굵기", min: 0, max: 0.13, step: 0.002 },
    ]},
  ]}
  actions={[{ label: "SVG 저장", primary: true, run: (ctx) => … }]}
  canvasRef={canvasRef} meta={meta}
/>
```

컨트롤 타입: `textarea` `range` `select` `file` `icons` `chips` `colors` `toggle` `buttons`

셸이 대신 해주는 것

- 상단 바 — 갤러리 링크, 실험실 전환 셀렉트, `링크 복사`
- 상태 ↔ 쿼리스트링 양방향 동기화 (기본값과 다른 값만 URL에 실린다)
- 드래그 중 저해상도 초안 → 놓으면 고해상도 (`onChange` 의 `draft` 인자)
- 다운로드 + 샌드박스 환경 폴백
- 라이트/다크 테마, 모바일 스택 레이아웃

## 새 실험실 추가하기

1. `src/labs.ts` 배열에 항목 추가 — `slug` `title` `tagline` `description` `keywords` `tags` `status` `mark`
2. `src/labs/<slug>/` — 엔진(프레임워크 무관)과 `'use client'` 컴포넌트
3. `src/app/lab/<slug>/page.tsx` — `metadata` + 컴포넌트 + `article.mdx`

`status: "soon"` 이면 갤러리에 점선 카드로만 보이고 sitemap 에서도 빠진다.

## SEO

- 페이지마다 `title` · `description` · `keywords` · canonical
- OG / Twitter 카드 이미지 (`public/og/`)
- `WebApplication` · `CollectionPage` JSON-LD
- `sitemap.xml` · `robots.txt` 자동 생성
- 도구 아래 MDX 설명 글 — 검색 유입은 사실 도구 이름이 아니라 이 글에서 온다

> OG 이미지는 지금 정적 파일이다. 만든 조합마다 다른 미리보기를 띄우려면
> 런타임이 필요하므로(`next/og`), 그때는 Vercel 로 옮겨야 한다.

## 실험 1 — Framefit Type Lab

글자를 프레임 안에 흘려 넣고 왜곡 · 아웃라인 · 입체 그림자를 실시간으로 조작한다.
자세한 원리는 `src/app/lab/framefit/article.mdx` (사이트에서는 도구 아래에 붙어 있다).

요약하면, 프레임은 "가로 위치 x 에서 도형의 세로 구간 [위, 아래]" 를 돌려주는 함수 하나이고,
글자는 세로 1픽셀 열 단위로 잘려 그 구간에 맞춰 늘어난다. 폰트 아웃라인을 파싱하지 않으므로
opentype.js 같은 의존성이 없고, 사용자가 업로드한 폰트도 그대로 동작한다.
SVG 는 마칭 스퀘어 윤곽 추적 → 이동 평균 → RDP 단순화로 뽑는다.

## 라이선스

코드는 MIT. 번들된 폰트는 없고 Google Fonts 에서 불러오며 각자의 라이선스(대부분 OFL)를 따른다.
