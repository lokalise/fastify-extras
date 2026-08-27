/**
 * Load an optional peer dependency, turning module resolution failure into a
 * message that names what to install.
 *
 * Both packages are peer dependencies rather than dependencies of this one:
 * `@scalar/fastify-api-reference` ships a rendered API reference bundle, and
 * a service registering any other plugin from this package has no use for it.
 * The cost of that is a failure at registration rather than at install time,
 * so it says which package is missing and what to do about it.
 */
export async function importOptionalPeer<T>(specifier: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (error) {
    const isMissingPackage =
      (error as NodeJS.ErrnoException | undefined)?.code === 'ERR_MODULE_NOT_FOUND' &&
      String((error as Error | undefined)?.message).includes(specifier)
    if (!isMissingPackage) throw error

    throw new Error(
      `apiDocumentationPlugin requires "${specifier}", which is not installed. It is a peer dependency of @lokalise/fastify-extras so that services not serving API documentation do not carry it: install it to register this plugin.`,
      { cause: error },
    )
  }
}
