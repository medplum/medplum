import 'server-only';

let _token: string | null = null;
let _tokenExpiry = 0;

const getBase = () => process.env.MEDPLUM_BASE_URL!.replace(/\/$/, '');

async function getServiceToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry - 60_000) return _token;

  const res = await fetch(`${getBase()}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.MEDPLUM_CLIENT_ID!,
      client_secret: process.env.MEDPLUM_CLIENT_SECRET!,
    }),
  });

  if (!res.ok) throw new Error(`Medplum token error: ${res.status}`);
  const data = await res.json();
  _token = data.access_token;
  _tokenExpiry = Date.now() + data.expires_in * 1000;
  return _token!;
}

export async function medplumFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getServiceToken();
  return fetch(`${getBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
      Authorization: `Bearer ${token}`,
      'X-Medplum-Project': process.env.MEDPLUM_PROJECT_ID!,
    },
  });
}

export async function fhirGet<T>(resourceType: string, id: string): Promise<T> {
  const res = await medplumFetch(`/fhir/R4/${resourceType}/${id}`);
  if (!res.ok) throw new Error(`FHIR GET error: ${res.status}`);
  return res.json();
}

export async function fhirSearch<T>(resourceType: string, params: Record<string, string>): Promise<T[]> {
  const qs = new URLSearchParams(params).toString();
  const res = await medplumFetch(`/fhir/R4/${resourceType}?${qs}`);
  if (!res.ok) throw new Error(`FHIR search error: ${res.status}`);
  const bundle = await res.json();
  return bundle.entry?.map((e: any) => e.resource) ?? [];
}

export async function fhirCreate<T>(resourceType: string, resource: T): Promise<T> {
  const res = await medplumFetch(`/fhir/R4/${resourceType}`, {
    method: 'POST',
    body: JSON.stringify(resource),
  });
  if (!res.ok) throw new Error(`FHIR create error: ${res.status}`);
  return res.json();
}

export async function fhirUpdate<T>(resourceType: string, id: string, resource: T): Promise<T> {
  const res = await medplumFetch(`/fhir/R4/${resourceType}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(resource),
  });
  if (!res.ok) throw new Error(`FHIR update error: ${res.status}`);
  return res.json();
}
