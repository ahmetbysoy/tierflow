import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function PriceTicker({ price, symbol }: { price: number; symbol: string }) {
  const prev = useRef(price)
  const [dir, setDir] = useState<'up' | 'down' | 'flat'>('flat')

  useEffect(() => {
    if (price > prev.current) setDir('up')
    else if (price < prev.current) setDir('down')
    else setDir('flat')
    prev.current = price
  }, [price])

  const color = dir === 'up' ? 'var(--green)' : dir === 'down' ? 'var(--red)' : 'var(--cyan)'

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={price.toFixed(2)}
          initial={{ y: dir === 'up' ? -6 : 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: dir === 'up' ? 6 : -6, opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18, color, letterSpacing: -0.5 }}
        >
          ${price ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
        </motion.div>
      </AnimatePresence>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>{symbol}</span>
    </div>
  )
}
