/* Framefit SVG 내보내기 — 윤곽 추적은 공통 트레이서(@/lib/trace)를 쓴다. */
import { escXML, ringsToPath } from "@/lib/trace";
import { buildLayers, type FontDef, type FramefitState } from "./engine";

export function toSVG(C: FramefitState, fonts: FontDef[], S = 1200): string {
  const L = buildLayers(S, C, fonts);
  const scale = 1000 / S;
  const tol = 0.75;
  const parts: string[] = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">',
    `<title>${escXML(C.text.replace(/\n/g, " "))}</title>`
  ];
  if (!C.transparent) parts.push(`<rect width="1000" height="1000" fill="${C.cBg}"/>`);
  if (L.shadow) parts.push(`<path fill="${C.cShadow}" fill-rule="evenodd" d="${ringsToPath(L.shadow, scale, tol)}"/>`);
  if (L.sil) parts.push(`<path fill="${C.cOut}" fill-rule="evenodd" d="${ringsToPath(L.sil, scale, tol)}"/>`);
  parts.push(`<path fill="${C.cFill}" fill-rule="evenodd" d="${ringsToPath(L.mask, scale, tol)}"/>`);
  parts.push("</svg>");
  return parts.join("\n");
}
