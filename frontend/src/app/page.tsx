import { OpportunitiesTable } from '@/components/opportunities-table';

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">GapSeeker</h1>
          <p className="text-sm text-muted-foreground">
            Prediction Market Arbitrage Scanner
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <OpportunitiesTable />
      </main>
    </div>
  );
}
