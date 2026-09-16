// Keep bounded date queries complete when the database caps each response.
export async function readAllRows<T, E>(query: {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: E | null }>;
}) {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) return { data: [] as T[], error };
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return { data: rows, error: null };
  }
}
