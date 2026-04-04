import { VERSION } from '@/lib/version';

export default function Home() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to {VERSION.display}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground">Patients</h3>
          <p className="mt-2 text-2xl font-bold">1,234</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground">Practitioners</h3>
          <p className="mt-2 text-2xl font-bold">56</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground">Organizations</h3>
          <p className="mt-2 text-2xl font-bold">12</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground">Questionnaires</h3>
          <p className="mt-2 text-2xl font-bold">89</p>
        </div>
      </div>
    </div>
  );
}
