export type LabStatus = "live" | "soon";

export type Lab = {
  slug: string;
  title: string;
  tagline: string;
  /** 검색 결과와 OG 설명에 쓰이는 한 문장. tagline 보다 길고 구체적으로. */
  description: string;
  keywords: string[];
  tags: string[];
  status: LabStatus;
  /** 갤러리 카드용 64×64 인라인 SVG */
  mark: string;
};

/** 실험실 목록 — 갤러리 · 각 실험실 상단 메뉴 · sitemap 이 이 배열 하나를 읽는다.
 *  새 실험을 추가할 때는 여기에 한 항목 넣고 src/app/lab/<slug>/ 를 만들면 된다. */
export const LABS: Lab[] = [
  {
    slug: "framefit",
    title: "Framefit Type Lab",
    tagline: "글자를 원형·웨이브·아치 프레임에 흘려 넣고 왜곡·아웃라인·입체 그림자를 조작한다.",
    description:
      "원하는 글자를 원형·웨이브·블롭·아치·삼각 프레임 안에 채워 넣고, 굵기·왜곡·곡률·아웃라인·입체 그림자를 슬라이더로 조작해 SVG와 PNG로 내보내는 무료 레터링 도구. 한글 폰트와 직접 올린 폰트도 지원합니다.",
    keywords: [
      "원형 로고 만들기", "타이포그래피 로고", "레터링 도구", "서클 로고 제너레이터",
      "글자 왜곡", "스티커 레터링", "SVG 로고 만들기", "circle logo generator", "warped type"
    ],
    tags: ["타이포그래피", "SVG", "캔버스"],
    status: "live",
    mark: '<circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/><path d="M14 32c0-11 8-17 18-17s18 6 18 17-8 17-18 17-18-6-18-17z" fill="currentColor"/><path d="M26 24h12v5h-7v3h6v5h-6v7h-5z" fill="var(--panel)"/>'
  },
  {
    slug: "woodcut",
    title: "Woodcut Type Lab",
    tagline: "글자를 파고 잉크를 올려 찍는다. 글자·도형을 끌어 배치하고 색마다 판을 따로 판다.",
    description:
      "평범한 폰트를 판화처럼 바꾸는 무료 레터링 도구. 조각도 종류와 크기, 잉크 번짐과 결손, 손떨림과 칼자국을 슬라이더로 만지면 리노컷·목판·고무 스탬프·레터프레스 질감의 글자가 실시간으로 나옵니다. 글자는 캔버스에서 끌어 옮기고 크기·기울기·회전을 조절할 수 있고, 원·별·하트 같은 도형을 넣어 색과 윤곽선을 지정하면 다색 판화처럼 색마다 판이 나뉘어 찍힙니다. SVG·PNG 저장, 한글과 직접 올린 폰트를 지원합니다.",
    keywords: [
      "판화 느낌 폰트", "리노컷 타이포그래피", "목판화 글씨", "스탬프 폰트 만들기",
      "빈티지 인쇄 질감", "레터프레스 효과", "거친 질감 로고", "글자 자유 배치",
      "다색 판화", "도형 삽입 로고", "woodcut type generator", "linocut lettering", "block print type"
    ],
    tags: ["타이포그래피", "질감", "인쇄"],
    status: "live",
    mark: '<path d="M11 15c-2 10-1 24 2 32 7 5 30 6 38 1 4-9 4-26 0-34-8-5-34-4-40 1z" fill="currentColor"/><ellipse cx="31" cy="31" rx="9" ry="6.5" fill="var(--panel)"/><path d="M46 12l4 3-3 4z" fill="currentColor"/><path d="M14 49l5 2-4 3z" fill="currentColor"/>'
  },
  {
    slug: "stencil",
    title: "Stencil Print Lab",
    tagline: "사진·글씨에서 실루엣을 따고, 그 뒤를 색연필·점묘·판화 질감으로 채운다.",
    description:
      "사진이나 글씨에서 실루엣과 윤곽선을 자동으로 따내고, 뚫린 자리 뒤를 색연필 그레인·점묘화·리소그래프 판화 질감으로 채워 포스터를 만드는 무료 도구. 잉크 색·그라디언트·격자 반복·종이 결까지 슬라이더로 조작하고 PNG로 내보냅니다.",
    keywords: [
      "사진 실루엣 만들기", "사진 윤곽선 따기", "리소그래프 효과", "판화 느낌 만들기",
      "점묘화 변환", "실크스크린 포스터", "색연필 질감", "스텐실 포스터",
      "risograph generator", "stencil print effect", "silhouette from photo"
    ],
    tags: ["이미지", "인쇄", "질감"],
    status: "live",
    mark: '<rect x="4" y="4" width="56" height="56" rx="5" fill="currentColor"/><path d="M32 9c2.2 14.5 6.5 18.8 21 21-14.5 2.2-18.8 6.5-21 21-2.2-14.5-6.5-18.8-21-21 14.5-2.2 18.8-6.5 21-21z" fill="var(--panel)"/><circle cx="13" cy="13" r="2.6" fill="var(--panel)"/><circle cx="51" cy="51" r="2.6" fill="var(--panel)"/><circle cx="51" cy="13" r="1.8" fill="var(--panel)"/><circle cx="13" cy="51" r="1.8" fill="var(--panel)"/>'
  },
  {
    slug: "halftone",
    title: "Halftone Lab",
    tagline: "사진을 인쇄용 하프톤으로. 점 모양·각도·밀도·CMYK 분리를 슬라이더로.",
    description: "사진을 인쇄용 하프톤 망점으로 변환하고 점 모양·스크린 각도·밀도·CMYK 분리를 조작하는 도구.",
    keywords: ["하프톤 변환", "망점", "리소그래프", "halftone generator"],
    tags: ["이미지", "인쇄"],
    status: "soon",
    mark: '<g fill="currentColor"><circle cx="16" cy="16" r="7"/><circle cx="32" cy="16" r="5"/><circle cx="48" cy="16" r="3"/><circle cx="16" cy="32" r="5"/><circle cx="32" cy="32" r="4"/><circle cx="48" cy="32" r="2"/><circle cx="16" cy="48" r="3"/><circle cx="32" cy="48" r="2"/><circle cx="48" cy="48" r="1.2"/></g>'
  },
  {
    slug: "dither",
    title: "Dither Studio",
    tagline: "사진의 색을 몇 개로 줄이고 잃어버린 계조를 점으로 되돌린다. 알고리즘을 나란히 놓고 비교한다.",
    description:
      "사진을 흑백 1비트·게임보이·리소·앰버 터미널 같은 제한된 색으로 바꾸는 무료 디더링 도구. Floyd–Steinberg·Atkinson·Jarvis·Stucki 같은 오차 확산과 Bayer·망점·블루 노이즈 같은 정렬 디더 열여덟 가지를 점 크기·세기·대비와 함께 실시간으로 조작합니다. 한 장을 칸으로 잘라 알고리즘을 나란히 비교하고, 색마다 판이 나뉜 SVG와 격자 그대로의 PNG로 내보냅니다.",
    keywords: [
      "디더링", "디더링 변환", "Floyd-Steinberg", "Bayer 디더", "Atkinson 디더", "블루 노이즈",
      "픽셀 아트 변환", "1비트 이미지", "흑백 변환", "망점 만들기", "리소 인쇄 효과",
      "게임보이 필터", "레트로 이미지 효과", "dither generator", "image dithering tool", "1-bit converter"
    ],
    tags: ["이미지", "알고리즘", "인쇄"],
    status: "live",
    mark: '<path fill="currentColor" d="M0 0h8v8h-8zM8 0h8v8h-8zM16 0h8v8h-8zM32 0h8v8h-8zM48 0h8v8h-8zM0 8h8v8h-8zM8 8h8v8h-8zM24 8h8v8h-8zM40 8h8v8h-8zM0 16h8v8h-8zM8 16h8v8h-8zM16 16h8v8h-8zM32 16h8v8h-8zM48 16h8v8h-8zM8 24h8v8h-8zM24 24h8v8h-8zM0 32h8v8h-8zM8 32h8v8h-8zM16 32h8v8h-8zM32 32h8v8h-8zM48 32h8v8h-8zM0 40h8v8h-8zM8 40h8v8h-8zM24 40h8v8h-8zM40 40h8v8h-8zM0 48h8v8h-8zM8 48h8v8h-8zM16 48h8v8h-8zM32 48h8v8h-8zM48 48h8v8h-8zM8 56h8v8h-8zM24 56h8v8h-8z"/>'
  },
  {
    slug: "contrast",
    title: "Contrast Auditor",
    tagline: "WCAG 2 대비비와 APCA 점수를 동시에. 두 기준이 엇갈리는 구간을 표시한다.",
    description: "색 조합의 WCAG 2 대비비와 APCA 점수를 동시에 계산하고 두 기준이 엇갈리는 구간을 드러내는 접근성 도구.",
    keywords: ["명도 대비", "WCAG 대비비", "APCA", "웹 접근성 색", "색약 시뮬레이션"],
    tags: ["접근성", "색"],
    status: "soon",
    mark: '<circle cx="32" cy="32" r="24" fill="currentColor"/><path d="M32 8a24 24 0 0 1 0 48z" fill="var(--panel)"/><circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" stroke-width="2"/>'
  },
  {
    slug: "motion",
    title: "Motion Curve Lab",
    tagline: "이징 커브 하나를 편집하면 모달·토스트·리스트에 동시에 적용돼 비교된다.",
    description: "베지어 이징 커브를 편집하면 모달·토스트·리스트 아이템에 동시에 적용돼 체감 차이를 비교하는 도구.",
    keywords: ["이징 커브", "cubic-bezier", "UI 애니메이션", "모션 디자인"],
    tags: ["모션", "UX"],
    status: "soon",
    mark: '<path d="M8 52C24 52 24 12 56 12" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="8" cy="52" r="4" fill="currentColor"/><circle cx="56" cy="12" r="4" fill="currentColor"/><circle cx="24" cy="52" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="40" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>'
  },
  {
    slug: "perceived-time",
    title: "Loading Perception Test",
    tagline: "같은 3초를 스피너·스켈레톤·진행바로 보여주고 체감 시간을 모은다.",
    description: "동일한 대기 시간을 스피너·스켈레톤·진행바로 보여주고 방문자의 체감 시간을 수집하는 UX 실험.",
    keywords: ["체감 대기 시간", "스켈레톤 UI", "로딩 인디케이터", "perceived performance"],
    tags: ["UX 리서치", "실험"],
    status: "soon",
    mark: '<rect x="8" y="18" width="48" height="8" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><rect x="10" y="20" width="20" height="4" rx="2" fill="currentColor"/><rect x="8" y="38" width="48" height="8" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><rect x="10" y="40" width="38" height="4" rx="2" fill="currentColor"/>'
  }
];

export const SITE = {
  name: "design-lab",
  title: "디자인 실험실",
  url: "https://warmwhiten.github.io/design-lab",
  author: "warmwhiten",
  description:
    "브라우저에서 바로 돌려보는 작은 인터랙티브 디자인 도구 모음. 파라미터를 슬라이더로 만지면 결과가 즉시 바뀌고, 만든 조합은 링크 그대로 공유됩니다."
};

export const getLab = (slug: string) => LABS.find((l) => l.slug === slug);
