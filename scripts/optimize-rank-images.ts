/**
 * Genera las insignias de rango para la app a partir de los PNG originales (512×512):
 * WebP con transparencia a 256×256 (nítido hasta ~96 px en pantallas 3×), mucho más ligero.
 *   npm run optimize-rank-images
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const SRC = 'src/assets/ranks'
const OUT = join(SRC, 'web')

const files = (await readdir(SRC)).filter((f) => /^rank-\d-.+\.png$/.test(f)).sort()
for (const file of files) {
  const out = join(OUT, file.replace(/\.png$/, '.webp'))
  const info = await sharp(join(SRC, file)).resize(256, 256).webp({ quality: 85, alphaQuality: 90, effort: 6 }).toFile(out)
  console.log(`${out}  ${(info.size / 1024).toFixed(1)} KB`)
}
