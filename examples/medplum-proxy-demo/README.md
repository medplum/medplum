# Medplum Proxy Demo

A minimal example of the **pass-through proxy with M2M client credentials** integration pattern:
a frontend that never authenticates with Medplum and requires no Medplum token, talking through a lightweight proxy server that authenticates with a single Medplum `ClientApplication` ID and secret.

```
┌────────────────────┐         ┌────────────────────┐         ┌──────────────────┐
│  Browser            │  fetch  │  Proxy server        │  fetch  │  Medplum server    │
│  MedplumClient       │ ──────▶ │  server/proxy.ts      │ ──────▶ │  (self-hosted or   │
│  baseUrl = proxy      │         │  injects Bearer token │         │  api.medplum.com)  │
│  (no login, no token)│ ◀────── │  from client_credentials│ ◀────── │                    │
└────────────────────┘         └────────────────────┘         └──────────────────┘
```

## Warning

This pattern moves all trust to the proxy. Understand these implications before using it:

- **You are responsible for authentication and authorization.** The proxy performs **no** auth
  on incoming browser requests -- every request is forwarded using the same shared M2M credential,
  and there is no signed-in user. Anyone who can reach the proxy can make any request it forwards.
  In a real deployment you must add your own auth layer _in front of_ the proxy (verify a session
  cookie/JWT, authorize the caller/tenant, rate-limit) before any request reaches Medplum. See the
  comment in `server/proxy.ts`.
- **Callers get everything the M2M client can access.** The proxy's requests carry the
  `ClientApplication`'s identity, so a browser talking to the proxy can read/write anything that
  client's access policy permits -- not a narrower per-user view. Scope the `ClientApplication`'s
  access policy to the absolute minimum the page should expose (e.g. read-only `Patient`), because
  that policy is the _only_ boundary protecting your data.

## Files

- **`src/`** -- a single-page React app. `MedplumClient` is constructed with only a `baseUrl`
  (pointed at the proxy) and never calls `startLogin`, `signInWithRedirect`, or
  `startClientLogin`. It renders `@medplum/react`'s `SearchControl` for `Patient` with no sign-in
  page at all, because from the browser's point of view there is nothing to sign in to.
- **`server/proxy.ts`** -- an Express server that holds the _real_ credentials: a Medplum
  `ClientApplication` ID and secret. On every incoming request it fetches (and caches) an M2M
  access token via the OAuth2 [Client Credentials](https://www.medplum.com/docs/auth/methods/client-credentials)
  grant, attaches it as the request's `Authorization` header, and forwards the request verbatim to
  the real Medplum server. The response is streamed back unchanged.

This is a common shape for internal tools, kiosks, or embedding Medplum-backed data in a page where
you don't want to run a full OAuth2 flow in the browser -- the proxy is the only thing that ever
holds a credential.

## Non-goals

This demo intentionally does **not** implement:

- WebSocket subscriptions
- Binary/attachment handling, beyond passing the `Location` header through unmodified (Medplum
  redirects `Binary` reads to signed storage URLs; the proxy forwards that redirect instead of
  proxying the bytes itself)
- Response caching
- TLS termination
- Real session auth -- every browser request is proxied using the _same_ server-held M2M
  credential. There is no concept of an individual signed-in user in this example.

## Setup

1. [Register for a Medplum account](https://www.medplum.com/docs/tutorials/register) (or use a
   self-hosted server).
2. Create a `ClientApplication` (Project Admin → Clients) and note its **Client ID** and
   **Client Secret**.
3. Make sure that client's access policy grants whatever access you want the proxy to expose (for
   this demo, at least read access to `Patient`).

### Configure the proxy server

```bash
cp server/.env.defaults server/.env
```

Edit `server/.env`:

| Variable                | Required | Description                                                           |
| ----------------------- | -------- | --------------------------------------------------------------------- |
| `MEDPLUM_CLIENT_ID`     | Yes      | The `ClientApplication` ID.                                           |
| `MEDPLUM_CLIENT_SECRET` | Yes      | The `ClientApplication` secret.                                       |
| `MEDPLUM_BASE_URL`      | No       | Medplum server URL. Defaults to `http://localhost:8103/`.             |
| `PROXY_PORT`            | No       | Port the proxy listens on. Defaults to `8104`.                        |
| `ALLOWED_ORIGIN`        | No       | Browser origin allowed via CORS. Defaults to `http://localhost:3000`. |

### Configure the frontend

The frontend only needs to know where the proxy is running. `.env.defaults` already points it at
`http://localhost:8104/`; copy it to `.env` if you want to change that:

```bash
cp .env.defaults .env
```

## Running

```bash
npm install
npm run dev
```

This starts both the proxy server (`http://localhost:8104`) and the Vite dev server
(`http://localhost:3000`) together. Open `http://localhost:3000` -- you'll see a `Patient` search
table with no sign-in step.

To run them separately: `npm run dev:server` and `npm run dev:client`.

## How the proxy stays out of the way

- **CORS**: the proxy reflects `ALLOWED_ORIGIN` with `Access-Control-Allow-Credentials: true` so
  the browser's `fetch` calls succeed cross-origin.
- **Header forwarding**: only a small allowlist of request headers (`Content-Type`, `Accept`,
  `X-Medplum`, `Prefer`, `If-Match`, `If-None-Match`) is copied through. Any `Authorization` header
  the browser might send is dropped -- the proxy always overwrites it with its own M2M token, so
  there is no way for the browser to smuggle in different credentials.
- **Token caching**: the M2M access token is fetched once and cached in memory until it's close to
  expiring, then refreshed automatically. A single unexpected `401` triggers one forced refresh and
  retry before the error is passed through to the browser.
- **Everything else** (method, path, query string, request body, response status, response body) is
  passed through unchanged, which is what makes this a _pass-through_ proxy rather than a bespoke
  backend-for-frontend.
