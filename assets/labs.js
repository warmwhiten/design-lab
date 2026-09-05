/* =============================================================
   실험실 목록 — 갤러리와 각 실험실 상단 메뉴가 이 배열 하나를 읽는다.
   새 실험을 추가할 때는 여기에 한 줄 넣고 lab/<slug>/index.html 만 만들면 된다.
   ============================================================= */
window.LABS = [
  {
    slug: "framefit",
    title: "Framefit Type Lab",
    tagline: "글자를 원형·웨이브·아치 프레임에 흘려 넣고 왜곡·아웃라인·입체 그림자를 조작한다.",
    tags: ["타이포그래피", "SVG", "캔버스"],
    status: "live",
    mark: '<circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/><path d="M14 32c0-11 8-17 18-17s18 6 18 17-8 17-18 17-18-6-18-17z" fill="currentColor"/><path d="M26 24h12v5h-7v3h6v5h-6v7h-5z" fill="var(--panel)"/>'
  },
  {
    slug: "halftone",
    title: "Halftone Lab",
    tagline: "사진을 인쇄용 하프톤으로. 점 모양·각도·밀도·CMYK 분리를 슬라이더로.",
    tags: ["이미지", "인쇄"],
    status: "soon",
    mark: '<g fill="currentColor"><circle cx="16" cy="16" r="7"/><circle cx="32" cy="16" r="5"/><circle cx="48" cy="16" r="3"/><circle cx="16" cy="32" r="5"/><circle cx="32" cy="32" r="4"/><circle cx="48" cy="32" r="2"/><circle cx="16" cy="48" r="3"/><circle cx="32" cy="48" r="2"/><circle cx="48" cy="48" r="1.2"/></g>'
  },
  {
    slug: "dither",
    title: "Dither Studio",
    tagline: "같은 사진을 Floyd–Steinberg / Bayer / Atkinson으로 나란히 놓고 비교한다.",
    tags: ["이미지", "알고리즘"],
    status: "soon",
    mark: '<g fill="currentColor"><rect x="8" y="8" width="6" height="6"/><rect x="20" y="8" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/><rect x="26" y="14" width="6" height="6"/><rect x="8" y="20" width="6" height="6"/><rect x="32" y="20" width="6" height="6"/><rect x="20" y="26" width="6" height="6"/><rect x="38" y="8" width="6" height="6"/><rect x="44" y="26" width="6" height="6"/><rect x="14" y="38" width="6" height="6"/><rect x="32" y="44" width="6" height="6"/><rect x="50" y="44" width="6" height="6"/></g>'
  },
  {
    slug: "contrast",
    title: "Contrast Auditor",
    tagline: "WCAG 2 대비비와 APCA 점수를 동시에. 두 기준이 엇갈리는 구간을 표시한다.",
    tags: ["접근성", "색"],
    status: "soon",
    mark: '<circle cx="32" cy="32" r="24" fill="currentColor"/><path d="M32 8a24 24 0 0 1 0 48z" fill="var(--panel)"/><circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" stroke-width="2"/>'
  },
  {
    slug: "motion",
    title: "Motion Curve Lab",
    tagline: "이징 커브 하나를 편집하면 모달·토스트·리스트에 동시에 적용돼 비교된다.",
    tags: ["모션", "UX"],
    status: "soon",
    mark: '<path d="M8 52C24 52 24 12 56 12" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="8" cy="52" r="4" fill="currentColor"/><circle cx="56" cy="12" r="4" fill="currentColor"/><circle cx="24" cy="52" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="40" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>'
  },
  {
    slug: "perceived-time",
    title: "Loading Perception Test",
    tagline: "같은 3초를 스피너·스켈레톤·진행바로 보여주고 체감 시간을 모은다.",
    tags: ["UX 리서치", "실험"],
    status: "soon",
    mark: '<rect x="8" y="18" width="48" height="8" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><rect x="10" y="20" width="20" height="4" rx="2" fill="currentColor"/><rect x="8" y="38" width="48" height="8" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><rect x="10" y="40" width="38" height="4" rx="2" fill="currentColor"/>'
  }
];
