import { describe, expect, it } from 'vitest'
import {
  minDwellSecondsForBrowse,
  passesQuizAtLeastEightyPercent,
} from './reading-browse-rules'

describe('minDwellSecondsForBrowse', () => {
  it('wordCount 10 -> 40', () => {
    expect(minDwellSecondsForBrowse(10)).toBe(40)
  })
  it('wordCount 1000 -> 60', () => {
    expect(minDwellSecondsForBrowse(1000)).toBe(60)
  })
  it('wordCount 10000 -> 180', () => {
    expect(minDwellSecondsForBrowse(10000)).toBe(180)
  })
})

describe('passesQuizAtLeastEightyPercent', () => {
  it('(4,4) false', () => {
    expect(passesQuizAtLeastEightyPercent(4, 4)).toBe(false)
  })
  it('(5,5) true', () => {
    expect(passesQuizAtLeastEightyPercent(5, 5)).toBe(true)
  })
  it('(4,5) true', () => {
    expect(passesQuizAtLeastEightyPercent(4, 5)).toBe(true)
  })
  it('(3,5) false', () => {
    expect(passesQuizAtLeastEightyPercent(3, 5)).toBe(false)
  })
})