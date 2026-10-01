export function recordMutationParams(id: string, expectedUpdatedAt: string) {
  return new URLSearchParams({ id, expectedUpdatedAt }).toString();
}
