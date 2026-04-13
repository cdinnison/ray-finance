export function parseProviderState<T>(raw: string | null | undefined): T {
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

export function stringifyProviderState(state: unknown): string {
  return JSON.stringify(state);
}
