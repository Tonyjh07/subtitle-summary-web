/**
 * 图标生成脚本（一次性开发工具）：由源 SVG 生成 PWA 所需的 PNG 图标。
 * 运行：pnpm node scripts/generate-icons.mjs
 * 产物已提交进 public/icons；修改图标后请重新运行并提交。
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const OUT_DIR = join(process.cwd(), 'public', 'icons')

const GRADIENT_DEFS = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#8b5cf6"/>
    <stop offset="1" stop-color="#6d28d9"/>
  </linearGradient>
</defs>`

/** 品牌图形：文字稿卡片 + 声波，画在 512 画布坐标内 */
function glyph(transform = '') {
  return `<g transform="${transform}">
    <rect x="196" y="148" width="150" height="216" rx="20" fill="#ffffff" opacity="0.96"/>
    <g fill="#7c3aed">
      <rect x="228" y="272" width="14" height="56" rx="7"/>
      <rect x="252" y="252" width="14" height="76" rx="7"/>
      <rect x="276" y="264" width="14" height="64" rx="7"/>
      <rect x="300" y="284" width="14" height="44" rx="7"/>
    </g>
    <g fill="#7c3aed" opacity="0.55">
      <rect x="228" y="184" width="86" height="12" rx="6"/>
      <rect x="228" y="210" width="60" height="12" rx="6"/>
    </g>
    <g stroke="#ffffff" stroke-width="18" stroke-linecap="round" fill="none" opacity="0.9">
      <path d="M132 236a56 56 0 0 1 0 40"/>
      <path d="M160 216a92 92 0 0 1 0 80"/>
    </g>
  </g>`
}

/** 常规图标：圆角矩形背景（透明四角） */
function roundedIconSvg(size) {
  const radius = Math.round(size * 0.1875)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
    ${GRADIENT_DEFS}
    <rect width="512" height="512" rx="${(radius * 512) / size}" fill="url(#bg)"/>
    ${glyph()}
  </svg>`
}

/** maskable 图标：全出血背景，图形缩入中央 80% 安全区 */
function maskableIconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
    ${GRADIENT_DEFS}
    <rect width="512" height="512" fill="url(#bg)"/>
    <g transform="translate(256 256) scale(0.78) translate(-256 -256)">
      ${glyph()}
    </g>
  </svg>`
}

/** apple-touch-icon：方形不透明（iOS 自行裁切圆角） */
function appleIconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
    ${GRADIENT_DEFS}
    <rect width="512" height="512" fill="url(#bg)"/>
    ${glyph()}
  </svg>`
}

async function render(svg, filename) {
  await sharp(Buffer.from(svg)).png().toFile(join(OUT_DIR, filename))
  console.log(`generated ${filename}`)
}

await mkdir(OUT_DIR, { recursive: true })
await render(roundedIconSvg(192), 'icon-192.png')
await render(roundedIconSvg(512), 'icon-512.png')
await render(maskableIconSvg(512), 'icon-maskable-512.png')
await render(appleIconSvg(180), 'apple-touch-icon.png')
console.log('done')
