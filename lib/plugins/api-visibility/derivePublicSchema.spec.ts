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

  describe.each<{
    name: string
    wrap: (schema: z.ZodType) => z.ZodType
    passesThrough: unknown[]
  }>([
    { name: 'ZodOptional', wrap: (schema) => schema.optional(), passesThrough: [undefined] },
    { name: 'ZodNullable', wrap: (schema) => schema.nullable(), passesThrough: [null] },
    { name: 'ZodDefault', wrap: (schema) => schema.default({ keep: 'd' }), passesThrough: [] },
    { name: 'ZodPrefault', wrap: (schema) => schema.prefault({ keep: 'd' }), passesThrough: [] },
    { name: 'ZodCatch', wrap: (schema) => schema.catch({ keep: 'c' }), passesThrough: [] },
    { name: 'ZodReadonly', wrap: (schema) => schema.readonly(), passesThrough: [] },
    {
      name: 'ZodNonOptional',
      wrap: (schema) => schema.optional().nonoptional(),
      passesThrough: [],
    },
  ])('single-inner wrapper: $name', ({ wrap, passesThrough }) => {
    const INNER_WITH_INTERNAL = z.object({
      keep: z.string(),
      secret: z.string().meta({ visibility: 'internal' }),
    })

    it('drops internal fields from the wrapped schema', () => {
      const derived = derivePublicSchema(wrap(INNER_WITH_INTERNAL))

      expect(derived.parse({ keep: 'k', secret: 's' })).toEqual({ keep: 'k' })
    })

    it('returns the same schema instance when the wrapped schema has no internal fields', () => {
      const schema = wrap(z.object({ keep: z.string() }))

      expect(derivePublicSchema(schema)).toBe(schema)
    })

    it.each(passesThrough)('passes %s through unchanged', (value) => {
      expect(derivePublicSchema(wrap(INNER_WITH_INTERNAL)).parse(value)).toEqual(value)
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

  describe('ZodSet', () => {
    it('drops internal fields from the value schema', () => {
      const schema = z.set(
        z.object({ keep: z.string(), secret: z.string().meta({ visibility: 'internal' }) }),
      )

      const parsed = derivePublicSchema(schema).parse(
        new Set([{ keep: 'k', secret: 's' }]),
      ) as Set<unknown>
      expect([...parsed]).toEqual([{ keep: 'k' }])
    })

    it('returns the same schema instance when the value has no internal fields', () => {
      const schema = z.set(z.object({ keep: z.string() }))

      expect(derivePublicSchema(schema)).toBe(schema)
    })
  })

  describe('ZodIntersection', () => {
    it('drops internal fields from both sides', () => {
      const schema = z.intersection(
        z.object({ a: z.string(), aSecret: z.string().meta({ visibility: 'internal' }) }),
        z.object({ b: z.string(), bSecret: z.string().meta({ visibility: 'internal' }) }),
      )

      expect(
        derivePublicSchema(schema).parse({ a: 'x', aSecret: 's', b: 'y', bSecret: 's' }),
      ).toEqual({ a: 'x', b: 'y' })
    })

    it('returns the same schema instance when neither side has internal fields', () => {
      const schema = z.intersection(z.object({ a: z.string() }), z.object({ b: z.string() }))

      expect(derivePublicSchema(schema)).toBe(schema)
    })
  })

  describe('ZodLazy', () => {
    it('drops internal fields from the lazily-resolved schema', () => {
      const schema = z.lazy(() =>
        z.object({ keep: z.string(), secret: z.string().meta({ visibility: 'internal' }) }),
      )

      expect(derivePublicSchema(schema).parse({ keep: 'k', secret: 's' })).toEqual({ keep: 'k' })
    })

    it('returns the same schema instance when the lazy schema has no internal fields', () => {
      const schema = z.lazy(() => z.object({ keep: z.string() }))

      expect(derivePublicSchema(schema)).toBe(schema)
    })
  })

  describe('recursive schemas', () => {
    it('strips internal fields without overflowing on the getter pattern', () => {
      const Node: z.ZodType = z.object({
        label: z.string(),
        secret: z.string().meta({ visibility: 'internal' }),
        get children() {
          return z.array(Node)
        },
      })

      const derived = derivePublicSchema(Node)
      expect(
        derived.parse({
          label: 'root',
          secret: 's',
          children: [{ label: 'child', secret: 's2', children: [] }],
        }),
      ).toEqual({ label: 'root', children: [{ label: 'child', children: [] }] })
    })

    it('strips internal fields without overflowing on a recursive z.lazy', () => {
      const Node: z.ZodType = z.lazy(() =>
        z.object({
          label: z.string(),
          secret: z.string().meta({ visibility: 'internal' }),
          next: Node.optional(),
        }),
      )

      const derived = derivePublicSchema(Node)
      expect(
        derived.parse({ label: 'a', secret: 's', next: { label: 'b', secret: 's2' } }),
      ).toEqual({ label: 'a', next: { label: 'b' } })
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

  describe('marker reachable through wrappers and containers', () => {
    it('drops a field whose marker precedes a wrapper (`.meta()` then `.optional()`)', () => {
      const schema = z.object({
        keep: z.string(),
        x: z.string().meta({ visibility: 'internal' }).optional(),
      })

      expect(derivePublicSchema(schema).parse({ keep: 'k', x: 's' })).toEqual({ keep: 'k' })
    })

    it('drops a field that is an array of an internal-marked component', () => {
      const note = z.object({ a: z.string() }).meta({ visibility: 'internal' })
      const schema = z.object({ keep: z.string(), notes: z.array(note) })

      expect(derivePublicSchema(schema).parse({ keep: 'k', notes: [{ a: 'x' }] })).toEqual({
        keep: 'k',
      })
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

  describe('preserves parent constraints when rewriting a child', () => {
    it('keeps array checks (e.g. min) when the element is rewritten', () => {
      const schema = z
        .array(z.object({ keep: z.string(), secret: z.string().meta({ visibility: 'internal' }) }))
        .min(1)
      const derived = derivePublicSchema(schema)

      expect(derived.safeParse([]).success).toBe(false)
      expect(derived.parse([{ keep: 'k', secret: 's' }])).toEqual([{ keep: 'k' }])
    })

    describe.each<{ name: string; build: (shape: z.ZodRawShape) => z.ZodObject }>([
      { name: 'strict()', build: (shape) => z.object(shape).strict() },
      { name: 'strictObject', build: (shape) => z.strictObject(shape) },
      { name: 'catchall()', build: (shape) => z.object(shape).catchall(z.string()) },
      { name: 'looseObject', build: (shape) => z.looseObject(shape) },
      { name: 'passthrough()', build: (shape) => z.object(shape).passthrough() },
    ])('strips unknown keys once a $name object drops an internal property', ({ build }) => {
      it('drops the internal field and any other unknown key', () => {
        const schema = build({
          keep: z.string(),
          secret: z.string().meta({ visibility: 'internal' }),
        })
        const derived = derivePublicSchema(schema)

        expect(derived.parse({ keep: 'k', secret: 's', extra: 'x' })).toEqual({ keep: 'k' })
      })
    })
  })
})
