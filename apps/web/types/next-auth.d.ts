import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface User {
    practitionerId: string;
    projectId: string;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      practitionerId: string;
      projectId: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    practitionerId: string;
    projectId: string;
  }
}
