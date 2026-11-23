import novato from '../../assets/ranks/web/rank-1-novato.webp'
import aprendiz from '../../assets/ranks/web/rank-2-aprendiz.webp'
import atleta from '../../assets/ranks/web/rank-3-atleta.webp'
import veterano from '../../assets/ranks/web/rank-4-veterano.webp'
import elite from '../../assets/ranks/web/rank-5-elite.webp'
import titan from '../../assets/ranks/web/rank-6-titan.webp'
import { RANK_CONFIG } from '../../data/ranking'

/** Insignia de cada tier (WebP 256 px generadas con `npm run optimize-rank-images`). */
export const RANK_IMAGES: Readonly<Record<string, string>> = { novato, aprendiz, atleta, veterano, elite, titan }

/** Imagen del tier por índice (la de Novato si el índice no existe). */
export const rankImage = (tierIndex: number): string => RANK_IMAGES[RANK_CONFIG.tiers[tierIndex]?.id ?? ''] ?? novato
