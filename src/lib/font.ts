/* 실험실 공통 폰트 유틸 — 목록 정의와 로딩만 담당한다. */

export type FontDef = { id: string; label: string; css: string; weight: number };

export function findFont(id: string, fonts: FontDef[]) {
  return fonts.find((f) => f.id === id) ?? fonts[0];
}

/** 웹폰트가 실제로 준비될 때까지 기다린다. 실패해도 렌더는 계속돼야 하므로 삼킨다. */
export function loadFont(F: FontDef, text = "") {
  const fam = F.css.replace(/"/g, "");
  return document.fonts
    .load(`${F.weight} 200px "${fam}"`, text + "ABC가나다")
    .catch(() => []);
}

/** 업로드한 폰트 파일을 등록하고 FontDef 로 돌려준다. */
export async function registerUserFont(file: File, prefix: string, n: number): Promise<FontDef> {
  const buf = await file.arrayBuffer();
  const family = `${prefix}User${n}`;
  const ff = new FontFace(family, buf);
  await ff.load();
  document.fonts.add(ff);
  return {
    id: `user${n}`,
    label: "내 폰트 · " + file.name.replace(/\.[^.]+$/, ""),
    css: `"${family}"`,
    weight: 400
  };
}
