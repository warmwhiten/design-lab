/* Woodcut SVG 내보내기.

   벡터로 나가는 것은 '판'이지 '찍힌 종이'가 아니다.
   잉크 결손(starve)까지 벡터로 옮기면 점 하나마다 링이 하나씩 생겨
   경로 수천 개짜리 파일이 된다. 그래서 SVG 는 결손 없는 조각면만 담는다.
   잉크가 튄 질감까지 그대로 필요하면 PNG 로 내보내면 된다. */
import { escXML, ringsToPath } from "@/lib/trace";
import { buildMask, type WoodcutState } from "./engine";
import type { FontDef } from "@/lib/font";

export function toSVG(C: WoodcutState, fonts: FontDef[], S = 1100): string {
  const mask = buildMask(S, C, fonts, false);
  const scale = 1000 / S;
  const parts: string[] = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">',
    `<title>${escXML(C.text.replace(/\n/g, " "))}</title>`
  ];
  if (!C.transparent) parts.push(`<rect width="1000" height="1000" fill="${C.cPaper}"/>`);
  parts.push(`<path fill="${C.cInk}" fill-rule="evenodd" d="${ringsToPath(mask, scale, 0.6, 2)}"/>`);
  parts.push("</svg>");
  return parts.join("\n");
}
