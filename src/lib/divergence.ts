/**
 * Divergence Skor Motoru - Tierflow Core
 * 
 * Mantık:
 * L1-L2 = Retail katmanı (0-0.3% spread içi) -> yoğunluk, panik satışı/alışı
 * L3-L4 = Mid katman
 * L5    = Whale katmanı (0.8%+ derinlik) -> gerçek absorbsiyon
 * 
 * Divergence = L5 balina yönü vs L1-L2 retail yönü ters ise yüksek skor
 */

export interface DepthLevel {
  price: number
  qty: number
  notional: number // price * qty
}

export interface TierMetrics {
  bidNotional: number
  askNotional: number
  bidQty: number
  askQty: number
  vwapBid: number
  vwapAsk: number
  imbalance: number // -1 (tam satıcı) ... +1 (tam alıcı) -> (bid - ask)/(bid+ask)
}

export interface DivergenceResult {
  score: number // -100 ... +100, +75 üstü LONG sinyali, -75 altı SHORT
  l1l2Imbalance: number
  l5Imbalance: number
  l5Vwap: number
  hasAbsorption: boolean
  retailDirection: 'long' | 'short' | 'neutral'
  whaleDirection: 'long' | 'short' | 'neutral'
  confidence: 'low' | 'medium' | 'high' // hacim yeterliliği
}

function calcTier(bids: DepthLevel[], asks: DepthLevel[]): TierMetrics {
  const bidNotional = bids.reduce((s, l) => s + l.notional, 0)
  const askNotional = asks.reduce((s, l) => s + l.notional, 0)
  const bidQty = bids.reduce((s, l) => s + l.qty, 0)
  const askQty = asks.reduce((s, l) => s + l.qty, 0)
  
  const vwapBid = bidNotional / (bidQty || 1)
  const vwapAsk = askNotional / (askQty || 1)
  
  const total = bidNotional + askNotional
  const imbalance = total > 0 ? (bidNotional - askNotional) / total : 0
  
  return { bidNotional, askNotional, bidQty, askQty, vwapBid, vwapAsk, imbalance }
}

function sliceByDistance(
  bids: DepthLevel[], 
  asks: DepthLevel[], 
  midPrice: number,
  minDistPct: number,
  maxDistPct: number
): { bids: DepthLevel[], asks: DepthLevel[] } {
  const filter = (levels: DepthLevel[], isBid: boolean) => levels.filter(l => {
    const dist = Math.abs(l.price - midPrice) / midPrice * 100
    return dist >= minDistPct && dist < maxDistPct
  })
  return { bids: filter(bids, true), asks: filter(asks, false) }
}

export function calcDivergence(
  rawBids: [string, string][],
  rawAsks: [string, string][],
  lastTrades?: { price: number, qty: number, isBuyerMaker: boolean }[]
): DivergenceResult {
  const bids: DepthLevel[] = rawBids.map(([p, q]) => {
    const price = parseFloat(p), qty = parseFloat(q)
    return { price, qty, notional: price * qty }
  })
  const asks: DepthLevel[] = rawAsks.map(([p, q]) => {
    const price = parseFloat(p), qty = parseFloat(q)
    return { price, qty, notional: price * qty }
  })

  if (bids.length === 0 || asks.length === 0) {
    return {
      score: 0,
      l1l2Imbalance: 0,
      l5Imbalance: 0,
      l5Vwap: 0,
      hasAbsorption: false,
      retailDirection: 'neutral',
      whaleDirection: 'neutral',
      confidence: 'low'
    }
  }

  const bestBid = bids[0].price
  const bestAsk = asks[0].price
  const midPrice = (bestBid + bestAsk) / 2

  // Katmanları ayır - senin eşiğine göre:
  // L1-L2: 0 - 0.3% (retail panik alanı)
  // L5: 0.8% - 1.5% (balina pusu alanı)
  const l1l2 = sliceByDistance(bids, asks, midPrice, 0, 0.3)
  const l5 = sliceByDistance(bids, asks, midPrice, 0.8, 1.5)

  const l1l2Metrics = calcTier(l1l2.bids, l1l2.asks)
  const l5Metrics = calcTier(l5.bids, l5.asks)

  // Yetersiz veri kontrolü - BLZ/TRB gibi çöp tahtalarda kritik
  const l5TotalNotional = l5Metrics.bidNotional + l5Metrics.askNotional
  const l1l2TotalNotional = l1l2Metrics.bidNotional + l1l2Metrics.askNotional
  const isLowLiquidity = l5TotalNotional < 5000 || l1l2TotalNotional < 10000 // USDT cinsinden eşik

  // Absorpsiyon tespiti: büyük hacim tek tarafta yığılmışsa
  // L5'te bid/ask oranı >2.5 ise absorpsiyon var
  const l5Ratio = l5Metrics.bidNotional / (l5Metrics.askNotional || 1)
  const hasAbsorption = l5Ratio > 2.5 || l5Ratio < 0.4

  const l1l2Imbalance = l1l2Metrics.imbalance
  const l5Imbalance = l5Metrics.imbalance

  // Direction mapping
  const retailDirection = l1l2Imbalance > 0.2 ? 'long' : l1l2Imbalance < -0.2 ? 'short' : 'neutral'
  const whaleDirection = l5Imbalance > 0.3 ? 'long' : l5Imbalance < -0.3 ? 'short' : 'neutral'

  // Divergence skor hesabı
  // Formül: (whaleImbalance - retailImbalance) * 50 * absorptionMultiplier
  // Örnek: whale +0.7 (alıcı), retail -0.6 (satıcı) => (0.7 - (-0.6))=1.3 *50 = 65, abs var ise *1.3 = 84.5 => SİNYAL
  let rawScore = (l5Imbalance - l1l2Imbalance) * 50
  if (hasAbsorption) rawScore *= 1.3

  // Trade flow doğrulaması (varsa)
  if (lastTrades && lastTrades.length > 20) {
    const buyerVol = lastTrades.filter(t => !t.isBuyerMaker).reduce((s, t) => s + t.price * t.qty, 0)
    const sellerVol = lastTrades.filter(t => t.isBuyerMaker).reduce((s, t) => s + t.price * t.qty, 0)
    const tradeImbalance = (buyerVol - sellerVol) / (buyerVol + sellerVol || 1)
    // Eğer trade akışı da retail ile aynı yöndeyse divergence güçlenir
    if (Math.sign(tradeImbalance) === Math.sign(l1l2Imbalance)) {
      rawScore *= 1.1
    }
  }

  const score = Math.max(-100, Math.min(100, Math.round(rawScore)))
  
  // L5 VWAP - senin TP/SL mantığına göre
  const l5Vwap = l5Metrics.bidNotional > l5Metrics.askNotional ? l5Metrics.vwapBid : l5Metrics.vwapAsk

  return {
    score,
    l1l2Imbalance,
    l5Imbalance,
    l5Vwap,
    hasAbsorption,
    retailDirection,
    whaleDirection,
    confidence: isLowLiquidity ? 'low' : hasAbsorption ? 'high' : 'medium'
  }
}

// Scalp sinyal eşikleri - senin kilitlediğin değerler
export const SIGNAL_CONFIG = {
  ENTRY_LONG: 75,   // > +75 LONG
  ENTRY_SHORT: -75, // < -75 SHORT
  TP_PCT: 0.004,    // L5 VWAP üstü %0.4 TP
  SL_PCT: 0.002,    // likidite altı %0.2 SL
  COOLDOWN_MS: 180_000, // 3dk
  MIN_CONFIDENCE: 'medium' as const
}

export function getSignal(div: DivergenceResult): { side: 'LONG' | 'SHORT' | null, reason: string } {
  if (div.confidence === 'low') return { side: null, reason: 'Düşük likidite - yetersiz veri (BLZ/TRB edge case)' }
  if (!div.hasAbsorption) return { side: null, reason: 'Absorpsiyon yok' }
  
  if (div.score > SIGNAL_CONFIG.ENTRY_LONG && div.whaleDirection === 'long' && div.retailDirection === 'short') {
    return { side: 'LONG', reason: `Divergence ${div.score} | Balina LONG absorbe ediyor, retail SHORT panikte` }
  }
  if (div.score < SIGNAL_CONFIG.ENTRY_SHORT && div.whaleDirection === 'short' && div.retailDirection === 'long') {
    return { side: 'SHORT', reason: `Divergence ${div.score} | Balina SHORT absorbe ediyor, retail LONG FOMO` }
  }
  return { side: null, reason: `Skor ${div.score} eşik altında` }
}
