import { describe, expect, it } from 'vitest'
import { RANK_CONFIG } from '../../data/ranking'
import { RANK_IMAGES, rankImage } from './rankImages'

describe('insignias de rango', () => {
  it('cada tier de la config tiene su imagen, distinta', () => {
    for (const t of RANK_CONFIG.tiers) expect(RANK_IMAGES[t.id]).toMatch(/rank-\d-.+\.webp/)
    expect(new Set(RANK_CONFIG.tiers.map((t) => RANK_IMAGES[t.id])).size).toBe(RANK_CONFIG.tiers.length)
  })

  it('por índice, en orden, y Novato si no existe', () => {
    expect(rankImage(0)).toContain('rank-1-novato')
    expect(rankImage(5)).toContain('rank-6-titan')
    expect(rankImage(99)).toContain('rank-1-novato')
  })
})
