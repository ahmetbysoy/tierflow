/**
 * ScoreAggregator — tek merkezi skor (Faz 2)
 * İndikatör z-skorları + detector confluence'ı tek potada birleştirir.
 * Önceki kopukluk: DetectorSuite sadece TradePlan'e gidiyor, computeScore'a w6=0 kalıyordu.
 * Şimdi: detectorScore normalize edilip w6 ile skora giriyor.
 */

import type { MicroSignal } from './tradePlan'

export interface AggregatorInput {
  cvdZ: number
  obi: number
  velocityZ: number
  microDev: number
  vpinAdj: number
  detectorBull: number
  detectorBear: number
  divergenceAdj?: number
}

export interface AggregatorWeights {
  w1: number; w2: number; w3: number; w4: number; w5: number; w6: number
}

export function computeDetectorScore(bull: number, bear: number): number {
  const norm = (bull - bear) / 100 // -1..+1, 100 = 50+50
  return Math.max(-1, Math.min(1, norm))
}

export function aggregateScore(
  input: AggregatorInput,
  weights: AggregatorWeights,
  divergenceAdj = 0
): { score: number; detectorScore: number; breakdown: Record<string, number> } {
  const wSum = weights.w1 + weights.w2 + weights.w3 + weights.w4 + weights.w5 + weights.w6
  const w = {
    w1: weights.w1 / (wSum || 1),
    w2: weights.w2 / (wSum || 1),
    w3: weights.w3 / (wSum || 1),
    w4: weights.w4 / (wSum || 1),
    w5: weights.w5 / (wSum || 1),
    w6: weights.w6 / (wSum || 1),
  }
  const detectorScore = computeDetectorScore(input.detectorBull, input.detectorBear)
  const score = w.w1 * input.cvdZ + w.w2 * input.obi + w.w3 * input.velocityZ + w.w4 * input.microDev + w.w5 * input.vpinAdj + w.w6 * detectorScore + (divergenceAdj || 0)
  const clamped = Math.max(-3, Math.min(3, score))
  return {
    score: clamped,
    detectorScore,
    breakdown: {
      cvdZ: input.cvdZ,
      obi: input.obi,
      velocityZ: input.velocityZ,
      microDev: input.microDev,
      vpinAdj: input.vpinAdj,
      detectorScore,
      divergenceAdj: divergenceAdj || 0
    }
  }
}
