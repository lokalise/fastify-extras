import { pruneUnreachableComponents } from './componentReachability.js'

describe('componentReachability', () => {
  describe('pruneUnreachableComponents', () => {
    it('keeps components the paths reference and drops the rest', () => {
      const document = {
        paths: {
          '/users': {
            get: {
              responses: {
                200: {
                  content: {
                    'application/json': { schema: { $ref: '#/components/schemas/User' } },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            User: { type: 'object' },
            Orphan: { type: 'object' },
          },
        },
      }

      const result = pruneUnreachableComponents(document)

      expect(Object.keys(result.components.schemas)).toStrictEqual(['User'])
    })

    it('follows references transitively', () => {
      const document = {
        paths: {
          '/users': {
            get: { responses: { 200: { $ref: '#/components/responses/UserResponse' } } },
          },
        },
        components: {
          responses: {
            UserResponse: {
              content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
            },
            UnusedResponse: { description: 'nothing points here' },
          },
          schemas: {
            User: {
              type: 'object',
              properties: { address: { $ref: '#/components/schemas/Address' } },
            },
            Address: { type: 'object' },
            Report: { type: 'object' },
          },
        },
      }

      const result = pruneUnreachableComponents(document)

      expect(Object.keys(result.components.schemas).sort()).toStrictEqual(['Address', 'User'])
      expect(Object.keys(result.components.responses)).toStrictEqual(['UserResponse'])
    })

    it('keeps schemas reachable only through a section that is never pruned', () => {
      const document = {
        paths: {},
        components: {
          securitySchemes: {
            apiKey: { type: 'apiKey', 'x-schema': { $ref: '#/components/schemas/Token' } },
          },
          schemas: { Token: { type: 'string' } },
        },
      }

      const result = pruneUnreachableComponents(document)

      expect(result.components.securitySchemes).toBeDefined()
      expect(Object.keys(result.components.schemas)).toStrictEqual(['Token'])
    })

    it('never prunes security schemes, which are referenced by name', () => {
      const document = {
        paths: { '/users': { get: { security: [{ apiKey: [] }] } } },
        components: { securitySchemes: { apiKey: { type: 'apiKey' } } },
      }

      const result = pruneUnreachableComponents(document)

      expect(result.components.securitySchemes).toStrictEqual({ apiKey: { type: 'apiKey' } })
    })

    it('follows discriminator mappings, which name schemas without $ref', () => {
      const document = {
        paths: {
          '/pets': {
            get: {
              responses: {
                200: {
                  content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            Pet: {
              oneOf: [{ $ref: '#/components/schemas/Cat' }],
              discriminator: {
                propertyName: 'petType',
                mapping: { cat: 'Cat', dog: '#/components/schemas/Dog' },
              },
            },
            Cat: { type: 'object' },
            Dog: { type: 'object' },
            Fish: { type: 'object' },
          },
        },
      }

      const result = pruneUnreachableComponents(document)

      expect(Object.keys(result.components.schemas).sort()).toStrictEqual(['Cat', 'Dog', 'Pet'])
    })

    it('follows $dynamicRef, which an OpenAPI 3.1 document may point at a component', () => {
      const document = {
        paths: {
          '/trees': {
            get: {
              responses: {
                200: {
                  content: {
                    'application/json': { schema: { $ref: '#/components/schemas/Tree' } },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            Tree: {
              type: 'object',
              properties: { root: { $dynamicRef: '#/components/schemas/Node' } },
            },
            Node: { type: 'object' },
            Orphan: { type: 'object' },
          },
        },
      }

      const result = pruneUnreachableComponents(document)

      expect(Object.keys(result.components.schemas).sort()).toStrictEqual(['Node', 'Tree'])
    })

    it('ignores a schema property that happens to be called discriminator', () => {
      const document = {
        paths: {
          '/pets': {
            get: {
              responses: {
                200: {
                  content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            Pet: {
              type: 'object',
              properties: { discriminator: { $ref: '#/components/schemas/Tag' } },
            },
            Tag: { type: 'string' },
          },
        },
      }

      const result = pruneUnreachableComponents(document)

      expect(Object.keys(result.components.schemas).sort()).toStrictEqual(['Pet', 'Tag'])
    })

    it('survives self-referential schemas', () => {
      const document = {
        paths: {
          '/trees': {
            get: {
              responses: {
                200: {
                  content: {
                    'application/json': { schema: { $ref: '#/components/schemas/Node' } },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            Node: {
              type: 'object',
              properties: {
                children: { type: 'array', items: { $ref: '#/components/schemas/Node' } },
              },
            },
          },
        },
      }

      const result = pruneUnreachableComponents(document)

      expect(Object.keys(result.components.schemas)).toStrictEqual(['Node'])
    })

    it('drops component sections left empty', () => {
      const document = {
        paths: {},
        components: { schemas: { Orphan: { type: 'object' } }, examples: { one: {} } },
      }

      const result = pruneUnreachableComponents(document)

      expect(result.components).toStrictEqual({})
    })

    it('does not mutate the input document', () => {
      const document = {
        paths: {},
        components: { schemas: { Orphan: { type: 'object' } } },
      }

      pruneUnreachableComponents(document)

      expect(document.components.schemas.Orphan).toBeDefined()
    })

    it('is idempotent', () => {
      const document = {
        paths: {
          '/users': {
            get: {
              responses: {
                200: {
                  content: {
                    'application/json': { schema: { $ref: '#/components/schemas/User' } },
                  },
                },
              },
            },
          },
        },
        components: { schemas: { User: { type: 'object' }, Orphan: { type: 'object' } } },
      }

      const once = pruneUnreachableComponents(document)
      const twice = pruneUnreachableComponents(once)

      expect(twice).toStrictEqual(once)
    })

    it('tolerates a document without components', () => {
      const document = { paths: { '/users': { get: {} } } }

      expect(pruneUnreachableComponents(document)).toStrictEqual(document)
    })
  })
})
