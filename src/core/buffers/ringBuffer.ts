/**
 * RingBuffer - sabit boyutlu FIFO
 * Trades için max 1000 kayıt
 */
export class RingBuffer<T> {
  private buf: (T | undefined)[]
  private head = 0
  private tail = 0
  private count = 0

  constructor(private capacity: number) {
    this.buf = new Array(capacity)
  }

  push(item: T): void {
    this.buf[this.tail] = item
    this.tail = (this.tail + 1) % this.capacity
    if (this.count < this.capacity) {
      this.count++
    } else {
      this.head = (this.head + 1) % this.capacity
    }
  }

  toArray(): T[] {
    const out: T[] = []
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity
      const v = this.buf[idx]
      if (v !== undefined) out.push(v)
    }
    return out
  }

  get size(): number {
    return this.count
  }

  get isFull(): boolean {
    return this.count === this.capacity
  }

  clear(): void {
    this.buf = new Array(this.capacity)
    this.head = 0
    this.tail = 0
    this.count = 0
  }

  last(): T | undefined {
    if (this.count === 0) return undefined
    const idx = (this.tail - 1 + this.capacity) % this.capacity
    return this.buf[idx]
  }
}
