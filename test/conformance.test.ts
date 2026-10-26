import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createValidators } from '../src/schema/validate'

const validators = createValidators()
const root = join(import.meta.dirname, 'bibframe-json', 'conformance')

describe.each(['linked', 'bounded'] as const)('%s conformance cases', (shape) => {
  describe.each(['accept', 'reject'] as const)('%s', (verdict) => {
    const dir = join(root, shape, verdict)
    it.each(readdirSync(dir).filter((name) => name.endsWith('.json')))('%s', (name) => {
      // Each case is {description, document}; the description says why.
      const { description, document } = JSON.parse(readFileSync(join(dir, name), 'utf8'))
      expect(validators[shape](document), description).toBe(verdict === 'accept')
    })
  })
})

describe('the example bounded description', () => {
  it('is a valid bounded description', () => {
    const document = JSON.parse(
      readFileSync(join(import.meta.dirname, 'bibframe-json', 'example', 'bounded.json'), 'utf8'),
    )
    expect(validators.bounded(document), JSON.stringify(validators.bounded.errors)).toBe(true)
  })
})
