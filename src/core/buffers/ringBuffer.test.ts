import { describe, it, expect } from 'vitest'
import { RingBuffer } from './ringBuffer'

describe('RingBuffer', () => {
  it('FIFO 1000 kapasite ve sızıntı yok', () => {
    const rb = new RingBuffer<number>(3)
    rb.push(1)
    rb.push(2)
    rb.push(3)
    expect(rb.toArray()).toEqual([1, 2, 3])
    expect(rb.isFull).toBe(true)
    rb.push(4) // overwrite oldest
    expect(rb.toArray()).toEqual([2, 3, 4])
    rb.push(5)
    expect(rb.toArray()).toEqual([3, 4, 5])
    expect(rb.size).toBe(3)
    expect(rb.last()).toBe(5)
    rb.clear()
    expect(rb.size).toBe(0)
    expect(rb.toArray()).toEqual([])
  })

  it('1000 limit', () => {
    const rb = new RingBuffer<number>(1000)
    for (let i = 0; i < 1500; i++) rb.push(i)
    expect(rb.size).toBe(1000)
    const arr = rb.toArray()
    expect(arr[0]).toBe(500)
    expect(arr[999]).toBe(1499)
  })
})
