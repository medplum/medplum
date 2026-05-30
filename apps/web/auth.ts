import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyUser } from '@/lib/users';
import type { AppUser } from '@/lib/users';
import { authConfig } from './auth.config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        return verifyUser(credentials.email as string, credentials.password as string) as Promise<AppUser | null>;
      },
    }),
  ],
});
