import 'server-only';

// Evaluated at call time, not module load time, so build succeeds without env vars
const getMedplumBase = () => process.env.MEDPLUM_BASE_URL!.replace(/\/$/, '');
const getClientId = () => process.env.MEDPLUM_CLIENT_ID!;

// ─── PKCE helpers (Web Crypto API — available in Node 18+) ──────────────────

function base64url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const codeVerifier = base64url(verifierBytes.buffer);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  const codeChallenge = base64url(hash);
  return { codeVerifier, codeChallenge };
}

// ─── Medplum auth flow ───────────────────────────────────────────────────────

export interface MedplumLoginResult {
  practitionerId: string;
  projectId: string;
  name: string;
  email: string;
}

export async function loginWithMedplum(
  email: string,
  password: string
): Promise<MedplumLoginResult | null> {
  try {
    const MEDPLUM_BASE = getMedplumBase();
    const CLIENT_ID = getClientId();
    const { codeVerifier, codeChallenge } = await generatePKCE();

    // Step 1: authenticate with email + password
    const loginRes = await fetch(`${MEDPLUM_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        clientId: CLIENT_ID,
        codeChallenge,
        codeChallengeMethod: 'S256',
        scope: 'openid offline',
      }),
    });

    if (!loginRes.ok) return null;

    const loginData = await loginRes.json();

    // If multiple memberships, user needs to pick a project (handle later)
    const code: string | undefined = loginData.code;
    if (!code) return null;

    // Step 2: exchange code for tokens
    const tokenRes = await fetch(`${MEDPLUM_BASE}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: CLIENT_ID,
        redirect_uri: process.env.NEXTAUTH_URL!,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) return null;

    const tokens = await tokenRes.json();

    // project.reference = "Project/xxx", profile.reference = "Practitioner/xxx"
    const projectId: string = tokens.project?.reference?.split('/')[1] ?? '';
    const practitionerId: string = tokens.profile?.reference?.split('/')[1] ?? '';

    if (!projectId || !practitionerId) return null;

    // Step 3: fetch practitioner name
    const profileRes = await fetch(
      `${MEDPLUM_BASE}/fhir/R4/Practitioner/${practitionerId}`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );

    const profile = profileRes.ok ? await profileRes.json() : null;
    const name: string =
      profile?.name?.[0]?.text ??
      [profile?.name?.[0]?.given?.[0], profile?.name?.[0]?.family].filter(Boolean).join(' ') ??
      email;

    return { practitionerId, projectId, name, email };
  } catch {
    return null;
  }
}
