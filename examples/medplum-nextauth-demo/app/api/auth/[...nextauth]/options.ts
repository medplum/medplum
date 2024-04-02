import type { NextAuthOptions } from 'next-auth';

export const options: NextAuthOptions = {
  debug: true,
  providers: [
    {
      id: 'medplum',
      name: 'Medplum',
      type: 'oauth',
      version: '2.0',
      checks: ['state', 'nonce'],
      wellKnown: 'https://api.medplum.com/.well-known/openid-configuration',
      accessTokenUrl: 'https://api.medplum.com/oauth2/token',
      authorization: {
        url: 'https://api.medplum.com/oauth2/authorize',
        params: {
          scope: 'openid profile email',
          redirect_uri: 'http://localhost:3000/api/auth/callback/medplum',
          response_type: 'code',
          nonce: '',
        },
      },
      clientId: process.env.MEDPLUM_CLIENT_ID,
      clientSecret: process.env.MEDPLUM_CLIENT_SECRET,
      profile: (profile) => {
        return {
          id: profile.login_id,
          name: profile.fhirUser,
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
        };
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        return {
          ...session,
          accessToken: token.accessToken,
        };
      }
      return session;
    },
  },
};
