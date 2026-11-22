import type { RankConfig, StrengthStandards } from '../domain/ranking'
import standardsJson from './strength-standards.json'
import rankConfigJson from './rank-config.json'

/** Estándares de fuerza (src/data/strength-standards.json, editable). */
export const STRENGTH_STANDARDS = standardsJson as unknown as StrengthStandards

/** Tiers, umbrales y parámetros del ranking (src/data/rank-config.json, editable). */
export const RANK_CONFIG = rankConfigJson as unknown as RankConfig
