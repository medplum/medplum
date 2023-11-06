export function getGoogleClientId(clientId: string | undefined): string | undefined {
  if (clientId) {
    return clientId;
  }

  if (typeof window !== 'undefined') {
    const origin = window.location.protocol + '//' + window.location.host;

    try {
      const authorizedOrigins = process.env.GOOGLE_AUTH_ORIGINS?.split(',') ?? [];

      if (authorizedOrigins.includes(origin)) {
        return process.env.GOOGLE_CLIENT_ID;
      }
    } catch (e) {
      if (e instanceof ReferenceError) {
        // static replacement of process.env.GOOGLE_AUTH_ORIGINS by Vite did not occur,
        // https://vitejs.dev/guide/env-and-mode.html
        return undefined;
      }
      throw e;
    }
  }

  return undefined;
}
