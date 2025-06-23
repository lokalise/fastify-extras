import type { FastifyPluginCallback } from 'fastify'
import fp from 'fastify-plugin'

const removeNullChars = (data: unknown): unknown => {
  if (typeof data === 'string') {
    return data.replaceAll('\u0000', '');
  }

  if (Array.isArray(data)) {
    return data.map(removeNullChars);
  }

  if (data !== null && typeof data === 'object') {
    return Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, removeNullChars(value)])
    );
  }

  return data;
}

const pluginCallback: FastifyPluginCallback = (fastify, _options, done) => {
  fastify.addHook('preValidation', (request, _reply, done) => {
    if (request.body) {
      request.body = removeNullChars(request.body);
    }
    done()
  });

  done()
}

export const removeNullCharsPlugin = fp(pluginCallback, {
  fastify: '5.x',
  name: 'remove-null-chars-plugin',
})
