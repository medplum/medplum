import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyUser } from '@/lib/users';

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
        token.practitionerId = (user as any).practitionerId;
        token.projectId = (user as any).projectId;
        token.role = (user as any).role;
      }
      return token;
    },
    session({ session, token }) {
      (session.user as any).practitionerId = token.practitionerId;
      (session.user as any).projectId = token.projectId;
      (session.user as any).role = token.role;
      return session;
    },
  },

  pages: { signIn: '/login', error: '/login' },
  session: { strategy: 'jwt' },
});
