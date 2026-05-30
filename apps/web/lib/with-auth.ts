import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import type { Session } from 'next-auth';

type AuthedHandler = (
  req: NextRequest,
  session: Session,
  context?: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>;

/**
 * Wraps an API route handler with session verification.
 * Returns 401 if no valid session exists.
 * Passes the typed session to the handler — no need to call auth() inside.
 */
export function withAuth(handler: AuthedHandler) {
  return async (
    req: NextRequest,
    context?: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return handler(req, session, context);
  };
}
