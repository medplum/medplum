const clientId = crypto.randomUUID();

export function useClientId(): string {
  return clientId;
}
