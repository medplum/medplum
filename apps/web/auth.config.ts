import type { NextAuthConfig } from 'next-auth';

// Edge-safe config — no Node.js built-ins.
// Credentials provider is added only in auth.ts (server runtime).
export const authConfig: NextAuthConfig = {
  pages: { signIn: '/login', error: '/login' },
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as { practitionerId?: string; projectId?: string; role?: string };
        token.practitionerId = u.practitionerId ?? '';
        token.projectId = u.projectId ?? '';
        token.role = u.role ?? '';
      }
      return token;
    },
    session({ session, token }) {
      session.user.practitionerId = token.practitionerId as string;
      session.user.projectId = token.projectId as string;
      session.user.role = token.role as string;
      return session;
    },
  },
  providers: [],
};
