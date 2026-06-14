/**
 * Shared mock database for unit tests.
 *
 * Every chain terminates in an async function returning an empty array (or
 * undefined for mutations), so callers that await the result always get a
 * sensible value.
 *
 * Critically, `.select().from().where()` resolves to [] (not an object),
 * which satisfies the openProperties query in checkDuplicates:
 *
 *   const openProperties = await db
 *     .select()
 *     .from(properties)
 *     .where(and(...));
 */

export const db = {
  select: () => ({
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
      where: () => ({
        // Awaitable directly — satisfies openProperties query
        then: (resolve) => resolve([]),
        // Also supports further chaining e.g. .where().limit()
        limit: async () => [],
      }),
    }),
  }),

  insert: () => ({
    values: () => ({
      returning: async () => [],
    }),
  }),

  update: () => ({
    set: () => ({
      where: async () => {},
    }),
  }),
};
