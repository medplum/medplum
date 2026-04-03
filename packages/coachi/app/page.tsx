export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="container flex flex-col items-center gap-6 px-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
          Coachi
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Intelligent coaching and care coordination platform built on Medplum
        </p>
        <div className="flex gap-4">
          <button className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Get Started
          </button>
          <button className="rounded-md border border-input bg-background px-6 py-3 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground">
            Learn More
          </button>
        </div>
      </div>
    </main>
  );
}
