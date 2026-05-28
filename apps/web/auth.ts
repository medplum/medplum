import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyUser } from '@/lib/users';
import type { AppUser } from '@/lib/users';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        return verifyUser(credentials.email as string, credentials.password as string);
      },
    }),
  ],

  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as AppUser;
        token.practitionerId = u.practitionerId;
        token.projectId = u.projectId;
        token.role = u.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.practitionerId = token.practitionerId;
      session.user.projectId = token.projectId;
      session.user.role = token.role as string;
      return session;
    },
  },

  pages: { signIn: '/login', error: '/login' },
  session: { strategy: 'jwt' },
});
