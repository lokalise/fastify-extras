import { pruneUnreferencedTags } from './tagReachability.js'

describe('tagReachability', () => {
  describe('pruneUnreferencedTags', () => {
    it('keeps the tags operations reference and drops the rest', () => {
      const document = {
        paths: {
          '/users': { get: { tags: ['Users'] } },
        },
        tags: [
          { name: 'Users', description: 'user operations' },
          { name: 'Orphan', description: 'nothing points here' },
        ],
      }

      const result = pruneUnreferencedTags(document)

      expect(result.tags).toStrictEqual([{ name: 'Users', description: 'user operations' }])
    })

    it('collects tags across every operation and path, de-duplicated', () => {
      const document = {
        paths: {
          '/users': { get: { tags: ['Users'] }, post: { tags: ['Users', 'Admin'] } },
          '/exports': { get: { tags: ['Export'] } },
        },
        tags: [{ name: 'Users' }, { name: 'Admin' }, { name: 'Export' }, { name: 'Unused' }],
      }

      const result = pruneUnreferencedTags(document)

      expect(result.tags.map((tag) => tag.name)).toStrictEqual(['Users', 'Admin', 'Export'])
    })

    it('empties the tags array when nothing survives', () => {
      const document = {
        paths: { '/health': { get: {} } },
        tags: [{ name: 'Users' }],
      }

      const result = pruneUnreferencedTags(document)

      expect(result.tags).toStrictEqual([])
    })

    it('keeps a tag object with no readable name', () => {
      const document = {
        paths: { '/users': { get: { tags: ['Users'] } } },
        tags: [{ name: 'Users' }, { description: 'nameless' }],
      }

      const result = pruneUnreferencedTags(document)

      expect(result.tags).toStrictEqual([{ name: 'Users' }, { description: 'nameless' }])
    })

    it('leaves a document without tags untouched', () => {
      const document = { paths: { '/users': { get: { tags: ['Users'] } } } }

      const result = pruneUnreferencedTags(document)

      expect(result).toStrictEqual(document)
    })

    it('does not mutate the input document', () => {
      const document = {
        paths: { '/users': { get: { tags: ['Users'] } } },
        tags: [{ name: 'Users' }, { name: 'Orphan' }],
      }

      pruneUnreferencedTags(document)

      expect(document.tags.map((tag) => tag.name)).toStrictEqual(['Users', 'Orphan'])
    })
  })
})
