import type { FreeformRecord } from '@lokalise/node-core'
import { stripInternalFieldsFromDocument } from './stripInternalFields.js'

const responseSchema = (document: FreeformRecord): FreeformRecord =>
  document.paths['/users'].get.responses['200'].content['application/json'].schema

const bodySchema = (document: FreeformRecord): FreeformRecord =>
  document.paths['/users'].post.requestBody.content['application/json'].schema

const parameters = (document: FreeformRecord): FreeformRecord[] =>
  document.paths['/users'].get.parameters

const objectSchema = (properties: FreeformRecord, required?: string[]): FreeformRecord => ({
  type: 'object',
  properties,
  ...(required ? { required } : {}),
})

/**
 * A document exercising every structure the walk touches: response and request
 * bodies, query parameters, a shared component, and nesting through objects and
 * arrays. Rebuilt per call so a mutating bug in one test cannot leak into another.
 */
const buildDocument = (): FreeformRecord => ({
  openapi: '3.1.0',
  info: { title: 'Users API', version: '1.0.0' },
  paths: {
    '/users': {
      get: {
        parameters: [
          { in: 'query', name: 'page', required: false, schema: { type: 'number' } },
          {
            in: 'query',
            name: 'internalFilter',
            required: false,
            schema: { type: 'string', visibility: 'internal' },
          },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: objectSchema(
                  {
                    id: { type: 'string' },
                    publicField: { type: 'string', visibility: 'public' },
                    internalField: { type: 'string', visibility: 'internal' },
                    nested: objectSchema({
                      keep: { type: 'string' },
                      internalNested: { type: 'string', visibility: 'internal' },
                    }),
                    list: {
                      type: 'array',
                      items: objectSchema({
                        label: { type: 'string' },
                        internalItem: { type: 'string', visibility: 'internal' },
                      }),
                    },
                  },
                  ['id', 'internalField'],
                ),
              },
            },
          },
        },
      },
      post: {
        requestBody: {
          content: {
            'application/json': {
              schema: objectSchema(
                {
                  name: { type: 'string' },
                  internalInput: { type: 'string', visibility: 'internal' },
                },
                ['name', 'internalInput'],
              ),
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      User: objectSchema(
        { id: { type: 'string' }, internalRef: { type: 'string', visibility: 'internal' } },
        ['id', 'internalRef'],
      ),
    },
  },
})

describe('stripInternalFields', () => {
  describe('stripInternalFieldsFromDocument (public)', () => {
    const strip = (): FreeformRecord => stripInternalFieldsFromDocument(buildDocument(), 'public')

    it('removes internal properties from a response schema', () => {
      expect(Object.keys(responseSchema(strip()).properties)).toEqual([
        'id',
        'publicField',
        'nested',
        'list',
      ])
    })

    it('drops removed internal properties from the `required` list', () => {
      expect(responseSchema(strip()).required).toEqual(['id'])
    })

    it('removes internal properties from a request body schema', () => {
      expect(Object.keys(bodySchema(strip()).properties)).toEqual(['name'])
      expect(bodySchema(strip()).required).toEqual(['name'])
    })

    it('recurses into nested object properties', () => {
      expect(Object.keys(responseSchema(strip()).properties.nested.properties)).toEqual(['keep'])
    })

    it('recurses into array item schemas', () => {
      expect(Object.keys(responseSchema(strip()).properties.list.items.properties)).toEqual([
        'label',
      ])
    })

    it('strips internal fields inside `components.schemas`', () => {
      expect(Object.keys(strip().components.schemas.User.properties)).toEqual(['id'])
    })

    it('drops internal query parameters', () => {
      expect(parameters(strip()).map((parameter) => parameter.name)).toEqual(['page'])
    })

    it('scrubs the `visibility` marker from every surviving property', () => {
      expect(responseSchema(strip()).properties.publicField.visibility).toBeUndefined()
      expect(JSON.stringify(strip())).not.toContain('visibility')
    })

    it('never leaks an internal field name into the document', () => {
      expect(JSON.stringify(strip())).not.toContain('internal')
    })

    it('drops `required` entirely when every required field was internal', () => {
      const document = {
        components: {
          schemas: {
            OnlyInternal: objectSchema({ secret: { type: 'string', visibility: 'internal' } }, [
              'secret',
            ]),
          },
        },
      }

      const result = stripInternalFieldsFromDocument(document, 'public')
      expect(result.components.schemas.OnlyInternal.required).toBeUndefined()
      expect(result.components.schemas.OnlyInternal.properties).toEqual({})
    })

    it('leaves a parameter without a schema untouched', () => {
      const document = { parameters: [{ in: 'query', name: 'ref', $ref: '#/x' }] }

      const result = stripInternalFieldsFromDocument(document, 'public') as FreeformRecord
      expect(result.parameters).toEqual([{ in: 'query', name: 'ref', $ref: '#/x' }])
    })
  })

  describe('stripInternalFieldsFromDocument (internal)', () => {
    const strip = (): FreeformRecord => stripInternalFieldsFromDocument(buildDocument(), 'internal')

    it('keeps internal properties', () => {
      expect(Object.keys(responseSchema(strip()).properties)).toEqual([
        'id',
        'publicField',
        'internalField',
        'nested',
        'list',
      ])
    })

    it('keeps the `required` list untouched', () => {
      expect(responseSchema(strip()).required).toEqual(['id', 'internalField'])
    })

    it('keeps internal query parameters', () => {
      expect(parameters(strip()).map((parameter) => parameter.name)).toEqual([
        'page',
        'internalFilter',
      ])
    })

    it('still scrubs the `visibility` marker from the document', () => {
      expect(JSON.stringify(strip())).not.toContain('visibility')
    })

    it('scrubs the `visibility` marker from a kept parameter schema', () => {
      const document = {
        parameters: [
          { in: 'query', name: 'x', schema: { type: 'string', visibility: 'internal' } },
        ],
      }

      const result = stripInternalFieldsFromDocument(document, 'internal') as FreeformRecord
      expect(result.parameters[0].schema).toEqual({ type: 'string' })
    })
  })
})
