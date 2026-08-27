/**
 * Load a peer dependency, turning module resolution failure into a message
 * that names what to install.
 *
 * `@fastify/swagger` is a peer rather than a dependency of this package: it
 * decorates the app the service owns, and its types appear in this plugin's
 * published options, so the service and this plugin have to agree on one
 * copy of it. The cost is that a missing install surfaces at registration
 * rather than at install time, which is why the message has to carry its own
 * weight.
 *
 * `@scalar/fastify-api-reference` is a plain dependency and needs none of
 * this. If it fails to resolve the install is broken, and telling the reader
 * to install a package that is already in `dependencies` would send them the
 * wrong way.
 */
export async function importPeerDependency<T>(
  specifier: string,
  load: () => Promise<T>,
): Promise<T> {
  try {
    return await load()
  } catch (error) {
    const isMissingPackage =
      (error as NodeJS.ErrnoException | undefined)?.code === 'ERR_MODULE_NOT_FOUND' &&
      String((error as Error | undefined)?.message).includes(specifier)
    if (!isMissingPackage) throw error

    throw new Error(
      `apiDocumentationPlugin requires "${specifier}", which is not installed. It is a peer dependency of @lokalise/fastify-extras: install it alongside this package.`,
      { cause: error },
    )
  }
}
