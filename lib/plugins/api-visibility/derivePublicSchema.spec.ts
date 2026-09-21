import { z } from 'zod/v4'
import { derivePublicSchema } from './derivePublicSchema.js'

describe('derivePublicSchema', () => {
  describe('ZodObject', () => {
    it('drops a property marked visibility: internal', () => {
      const schema = z.object({
        id: z.string(),
        secret: z.string().meta({ visibility: 'internal' }),
      })

      expect(derivePublicSchema(schema).parse({ id: '1', secret: 's' })).toEqual({ id: '1' })
    })

    it('keeps properties that are public or unmarked', () => {
      const schema = z.object({
        id: z.string(),
        name: z.string().meta({ visibility: 'public' }),
        secret: z.string().meta({ visibility: 'internal' }),
      })

      expect(derivePublicSchema(schema).parse({ id: '1', name: 'n', secret: 's' })).toEqual({
        id: '1',
        name: 'n',
      })
    })

    it('returns the same schema instance when nothing is internal', () => {
      const schema = z.object({ id: z.string(), name: z.string() })

      expect(derivePublicSchema(schema)).toBe(schema)
    })

    it('recurses into nested object properties', () => {
      const schema = z.object({
        id: z.string(),
        nested: z.object({
          keep: z.string(),
          secret: z.string().meta({ visibility: 'internal' }),
        }),
      })

      expect(
        derivePublicSchema(schema).parse({ id: '1', nested: { keep: 'k', secret: 's' } }),
      ).toEqual({ id: '1', nested: { keep: 'k' } })
    })
  })

  describe('ZodArray', () => {
    const INNER_WITH_INTERNAL = z.object({
      keep: z.string(),
      secret: z.string().meta({ visibility: 'internal' }),
    })

    it('drops internal fields from the element schema', () => {
      const derived = derivePublicSchema(z.array(INNER_WITH_INTERNAL))

      expect(derived.parse([{ keep: 'k', secret: 's' }])).toEqual([{ keep: 'k' }])
    })

    it('returns the same schema instance when the element has no internal fields', () => {
      const schema = z.array(z.object({ keep: z.string() }))

      expect(derivePublicSchema(schema)).toBe(schema)
    })
  })

  describe('ZodOptional', () => {
    const INNER_WITH_INTERNAL = z.object({
      keep: z.string(),
      secret: z.string().meta({ visibility: 'internal' }),
    })

    it('drops internal fields from the wrapped schema', () => {
      const derived = derivePublicSchema(INNER_WITH_INTERNAL.optional())

      expect(derived.parse({ keep: 'k', secret: 's' })).toEqual({ keep: 'k' })
    })

    it('keeps passing undefined through', () => {
      const derived = derivePublicSchema(INNER_WITH_INTERNAL.optional())

      expect(derived.parse(undefined)).toBeUndefined()
    })

    it('returns the same schema instance when the wrapped schema has no internal fields', () => {
      const schema = z.object({ keep: z.string() }).optional()

      expect(derivePublicSchema(schema)).toBe(schema)
    })
  })

  describe('ZodNullable', () => {
    const INNER_WITH_INTERNAL = z.object({
      keep: z.string(),
      secret: z.string().meta({ visibility: 'internal' }),
    })

    it('drops internal fields from the wrapped schema', () => {
      const derived = derivePublicSchema(INNER_WITH_INTERNAL.nullable())

      expect(derived.parse({ keep: 'k', secret: 's' })).toEqual({ keep: 'k' })
    })

    it('keeps passing null through', () => {
      const derived = derivePublicSchema(INNER_WITH_INTERNAL.nullable())

      expect(derived.parse(null)).toBeNull()
    })

    it('returns the same schema instance when the wrapped schema has no internal fields', () => {
      const schema = z.object({ keep: z.string() }).nullable()

      expect(derivePublicSchema(schema)).toBe(schema)
    })
  })

  describe('ZodRecord', () => {
    const INNER_WITH_INTERNAL = z.object({
      keep: z.string(),
      secret: z.string().meta({ visibility: 'internal' }),
    })

    it('drops internal fields from the value schema', () => {
      const derived = derivePublicSchema(z.record(z.string(), INNER_WITH_INTERNAL))

      expect(derived.parse({ a: { keep: 'k', secret: 's' } })).toEqual({ a: { keep: 'k' } })
    })

    it('returns the same schema instance when the value schema has no internal fields', () => {
      const schema = z.record(z.string(), z.object({ keep: z.string() }))

      expect(derivePublicSchema(schema)).toBe(schema)
    })
  })

  describe('ZodUnion', () => {
    const schema = z.union([
      z.object({ a: z.string(), aSecret: z.string().meta({ visibility: 'internal' }) }),
      z.object({ b: z.string(), bSecret: z.string().meta({ visibility: 'internal' }) }),
    ])

    it('drops internal fields from the option that matches', () => {
      const derived = derivePublicSchema(schema)

      expect(derived.parse({ a: 'x', aSecret: 's' })).toEqual({ a: 'x' })
      expect(derived.parse({ b: 'y', bSecret: 's' })).toEqual({ b: 'y' })
    })

    it('returns the same schema instance when no option has internal fields', () => {
      const clean = z.union([z.object({ a: z.string() }), z.object({ b: z.string() })])

      expect(derivePublicSchema(clean)).toBe(clean)
    })
  })

  describe('ZodDiscriminatedUnion', () => {
    const schema = z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('a'),
        x: z.string(),
        secret: z.string().meta({ visibility: 'internal' }),
      }),
      z.object({ kind: z.literal('b'), y: z.string() }),
    ])

    it('drops internal fields from the matched variant while keeping the discriminator', () => {
      const derived = derivePublicSchema(schema)

      expect(derived.parse({ kind: 'a', x: '1', secret: 's' })).toEqual({ kind: 'a', x: '1' })
      expect(derived.parse({ kind: 'b', y: '2' })).toEqual({ kind: 'b', y: '2' })
    })

    it('returns the same schema instance when no variant has internal fields', () => {
      const clean = z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('a'), x: z.string() }),
        z.object({ kind: z.literal('b'), y: z.string() }),
      ])

      expect(derivePublicSchema(clean)).toBe(clean)
    })
  })

  describe('ZodMap', () => {
    it('drops internal fields from the value schema', () => {
      const schema = z.map(
        z.string(),
        z.object({ keep: z.string(), secret: z.string().meta({ visibility: 'internal' }) }),
      )

      const derived = derivePublicSchema(schema)
      const parsed = derived.parse(new Map([['a', { keep: 'k', secret: 's' }]])) as Map<
        string,
        unknown
      >
      expect([...parsed]).toEqual([['a', { keep: 'k' }]])
    })

    it('returns the same schema instance when the value has no internal fields', () => {
      const schema = z.map(z.string(), z.object({ keep: z.string() }))

      expect(derivePublicSchema(schema)).toBe(schema)
    })
  })

  describe('unsupported constructs', () => {
    // `tuple` is deliberately not supported as it does not fit well an API definition.
    // It doubles as the fail-loud fixture.
    it('throws when an internal field hides inside an unsupported construct', () => {
      const schema = z.tuple([
        z.object({ keep: z.string(), secret: z.string().meta({ visibility: 'internal' }) }),
      ])

      expect(() => derivePublicSchema(schema)).toThrow(/unsupported/)
    })

    it('passes an unsupported construct through untouched when it has no internal fields', () => {
      const schema = z.tuple([z.string(), z.number()])

      expect(derivePublicSchema(schema)).toBe(schema)
    })
  })

  describe('nested combinations', () => {
    it('strips internal fields through objects, arrays, records, unions and optionals', () => {
      const schema = z.object({
        id: z.string(),
        items: z.array(
          z.object({ keep: z.string(), itemSecret: z.string().meta({ visibility: 'internal' }) }),
        ),
        byKey: z.record(
          z.string(),
          z.object({ v: z.string(), recSecret: z.string().meta({ visibility: 'internal' }) }),
        ),
        choice: z.union([
          z.object({ a: z.string(), aSecret: z.string().meta({ visibility: 'internal' }) }),
          z.object({ b: z.string() }),
        ]),
        maybe: z
          .object({ m: z.string(), mSecret: z.string().meta({ visibility: 'internal' }) })
          .optional(),
      })

      const derived = derivePublicSchema(schema)
      expect(
        derived.parse({
          id: '1',
          items: [{ keep: 'k', itemSecret: 's' }],
          byKey: { x: { v: 'v', recSecret: 's' } },
          choice: { a: 'a', aSecret: 's' },
          maybe: { m: 'm', mSecret: 's' },
        }),
      ).toEqual({
        id: '1',
        items: [{ keep: 'k' }],
        byKey: { x: { v: 'v' } },
        choice: { a: 'a' },
        maybe: { m: 'm' },
      })
    })
  })
})
