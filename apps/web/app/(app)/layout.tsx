import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import { Sidebar } from '@/components/layout/Sidebar';

async function logoutAction() {
  'use server';
  await signOut({ redirectTo: '/login' });
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/login');

  const userName = session.user?.name ?? session.user?.email ?? '';

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="hidden md:flex items-center justify-end gap-3 px-8 py-3 bg-white border-b border-slate-200">
          <span className="text-sm text-slate-600">{userName}</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
            >
              Sair
            </button>
          </form>
        </header>

        <main className="flex-1 p-4 md:p-8 pb-20 md:pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}
