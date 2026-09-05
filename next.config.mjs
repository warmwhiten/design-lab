import createMDX from "@next/mdx";

/** GitHub Pages 는 https://<user>.github.io/<repo>/ 아래에 붙으므로 basePath 가 필요하다.
 *  로컬 dev 와 Vercel 프리뷰에서는 비워두려면 BASE_PATH="" 로 실행. */
const basePath = process.env.BASE_PATH ?? "/design-lab";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",          // 정적 HTML 생성 — GitHub Pages 용
  trailingSlash: true,       // /lab/framefit/index.html 로 떨어지게
  basePath,
  images: { unoptimized: true },
  pageExtensions: ["ts", "tsx", "mdx"],
  env: { NEXT_PUBLIC_BASE_PATH: basePath }
};

export default createMDX({})(nextConfig);
