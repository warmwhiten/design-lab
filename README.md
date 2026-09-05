# design-lab

브라우저에서 바로 돌려보는 작은 인터랙티브 디자인 도구 모음.
파라미터를 슬라이더로 만지면 결과가 즉시 바뀌고, 만든 조합은 주소창 링크 그대로 공유된다.

🔗 https://warmwhiten.github.io/design-lab/

## 구조

```
index.html              갤러리 (메뉴)
assets/
  labs.js               실험실 목록 — 갤러리와 각 실험실 상단 메뉴가 이 배열 하나를 읽는다
  shell.css             공통 토큰 · 레일 · 스테이지 · 컨트롤 프리미티브
  shell.js              LabShell — 컨트롤 자동 생성 / URL 상태 동기화 / 내보내기
lab/
  framefit/             실험 1 — 프레임 레터링
    index.html
    framefit.js
```

빌드 도구 없음. 정적 파일 그대로 GitHub Pages에 올라간다.
외부 의존성은 Google Fonts 뿐.

## 공통 셸 (`assets/shell.js`)

각 실험실은 컨트롤을 **선언형 스펙**으로 넘기고, 셸이 DOM · 상태 · URL · 내보내기를 전부 처리한다.

```js
const shell = LabShell.mount({
  slug: "framefit",
  title: "Framefit Type Lab",
  tagline: "…",
  defaults: { weight: 0.03, frame: "circle", … },   // URL 동기화 대상이기도 하다
  groups: [
    { label: "프레임", controls: [
      { t: "icons", k: "frame", options: [...] },
      { t: "range", k: "weight", label: "굵기", min: 0, max: 0.13, step: 0.002 },
    ]},
  ],
  exports: [ { label: "SVG 저장", primary: true, run: api => {…} } ],
  onChange(state, draft) { /* draft=true 면 드래그 중 → 저해상도로 그린다 */ }
});
```

컨트롤 타입: `textarea` `range` `select` `file` `icons` `chips` `colors` `toggle` `buttons`

셸이 대신 해주는 것

- 상단 바 — 갤러리로 돌아가는 브랜드 링크, 실험실 전환 셀렉트, `링크 복사`
- 상태 ↔ 쿼리스트링 양방향 동기화 (기본값과 다른 값만 URL에 실린다)
- 드래그 중 저해상도 초안 → 놓으면 고해상도 (`onChange`의 `draft` 인자)
- 다운로드 + 샌드박스 환경 폴백(미리보기 이미지를 띄워 직접 저장)
- 라이트/다크 테마, 모바일 스택 레이아웃

## 새 실험실 추가하기

1. `assets/labs.js` 배열에 한 줄 추가 (`slug`, `title`, `tagline`, `tags`, `status`, `mark` SVG)
2. `lab/<slug>/index.html` — 공통 CSS/JS 3줄 불러오고 자기 스크립트 하나 붙이기
3. `lab/<slug>/<slug>.js` — `LabShell.mount({...})` 호출

`status: "soon"` 으로 두면 갤러리에 점선 카드로만 보이고 링크는 걸리지 않는다.

## 실험 1 — Framefit Type Lab

글자를 프레임 안에 흘려 넣고 왜곡 · 아웃라인 · 입체 그림자를 실시간으로 조작한다.

**작동 방식.** 프레임은 "가로 위치 `x`에서 도형의 세로 구간 `[위, 아래]`"를 돌려주는 함수 하나로 정의된다.
글자는 캔버스에 한 번 그린 뒤 **세로 1픽셀 열 단위로 잘라** 그 구간에 맞춰 늘려 붙인다.
덕분에 원형 · 웨이브 · 블롭 · 아치 · 삼각이 전부 같은 코드로 처리되고,
새 프레임을 추가하려면 `rawSpan()`에 `case` 하나만 쓰면 된다.
폰트 아웃라인을 파싱하지 않으므로 opentype.js 같은 의존성이 필요 없고,
사용자가 업로드한 폰트도 그대로 쓸 수 있다.

**SVG 내보내기.** 픽셀 마스크를 마칭 스퀘어로 윤곽 추적 → 이동 평균 스무딩 → Ramer–Douglas–Peucker
단순화 순으로 벡터화한다. 채움 · 아웃라인 · 입체 그림자가 각각 별도 `<path>` 로 나오고
(`fill-rule="evenodd"` 로 카운터 처리), 1000×1000 뷰박스 기준 15KB 안팎이다.

- 프레임 6종 · 프리셋 6종
- 폰트 9종 (한글 Black Han Sans, Jua 포함) + 내 폰트 업로드 (.ttf / .otf / .woff2)
- 슬라이더: 굵기 · 가로/세로 채움 · 자간 · 줄간 · 왜곡 강도 · 곡률 · 분할선 기울기 · 아웃라인 · 그림자 깊이/각도
- 내보내기: SVG, PNG 1× / 2× / 4× (1200 ~ 4800px), 배경 투명 옵션
- 가이드 토글 — 프레임 윤곽과 줄 경계를 점선으로 표시

## 라이선스

코드는 MIT. 번들된 폰트는 없고 Google Fonts에서 불러오며 각자의 라이선스(대부분 OFL)를 따른다.
