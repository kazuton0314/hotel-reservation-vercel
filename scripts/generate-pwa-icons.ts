/**
 * favicon と maskable アイコンを生成する（npm run generate:pwa-icons）
 * maskable は Android の安全域（中央 80%）に収める。
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.join(import.meta.dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const ICONS = path.join(PUBLIC, "icons");
const SOURCE = path.join(ICONS, "icon-512.png");
const THEME = { r: 47, g: 107, b: 84, alpha: 1 }; // #2f6b54

async function main() {
  await mkdir(ICONS, { recursive: true });

  const favicon32 = await sharp(SOURCE).resize(32, 32).png().toBuffer();
  await writeFile(path.join(PUBLIC, "favicon.ico"), favicon32);

  const logoSize = Math.round(512 * 0.72);
  const logo = await sharp(SOURCE)
    .resize(logoSize, logoSize, { fit: "contain", background: THEME })
    .png()
    .toBuffer();

  await sharp({
    create: { width: 512, height: 512, channels: 4, background: THEME },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(path.join(ICONS, "icon-maskable-512.png"));

  console.log("generate-pwa-icons: wrote public/favicon.ico, public/icons/icon-maskable-512.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
