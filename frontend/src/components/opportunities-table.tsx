'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOpportunities } from '@/hooks/use-opportunities';
import type { Opportunity } from '@/types';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function getCategoryBadge(category: string) {
  const categoryConfig: Record<string, { label: string; className: string }> = {
    sports: { label: 'Sports', className: 'bg-blue-500' },
    nba_game: { label: 'NBA', className: 'bg-orange-500' },
    weather: { label: 'Weather', className: 'bg-sky-500' },
    finance: { label: 'Finance', className: 'bg-emerald-500' },
    politics: { label: 'Politics', className: 'bg-purple-500' },
    other: { label: 'Other', className: 'bg-gray-500' },
  };

  const config = categoryConfig[category] || categoryConfig.other;
  return <Badge className={config.className}>{config.label}</Badge>;
}

function getLiquidityBadge(opportunity: Opportunity) {
  const { status } = opportunity.liquidity;

  switch (status) {
    case 'available':
      return <Badge className="bg-green-500">Available</Badge>;
    case 'spread_closed':
      return <Badge variant="secondary">Spread Closed</Badge>;
    case 'no_liquidity':
      return <Badge variant="destructive">No Liquidity</Badge>;
    case 'not_analyzed':
      return <Badge variant="outline">Not Analyzed</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
}

function getSpreadColor(spreadPct: number): string {
  if (spreadPct >= 3) return 'text-green-600 font-bold';
  if (spreadPct >= 2) return 'text-green-500 font-semibold';
  if (spreadPct >= 1) return 'text-green-400';
  return '';
}

function formatActionWithLinks(
  action: string,
  urls: { polymarket: string | null; kalshi: string | null }
) {
  // Parse the action to create links
  // Actions like: "Buy YES on Polymarket + NO on Kalshi"
  const polymarketLink = urls.polymarket ? (
    <a
      href={urls.polymarket}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 hover:text-blue-300 underline"
    >
      Polymarket
    </a>
  ) : (
    'Polymarket'
  );

  const kalshiLink = urls.kalshi ? (
    <a
      href={urls.kalshi}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 hover:text-blue-300 underline"
    >
      Kalshi
    </a>
  ) : (
    'Kalshi'
  );

  // Handle different action formats
  if (action.includes('YES on Polymarket') && action.includes('NO on Kalshi')) {
    return (
      <span>
        Buy YES on {polymarketLink} + NO on {kalshiLink}
      </span>
    );
  }
  if (action.includes('YES on Kalshi') && action.includes('NO on Polymarket')) {
    return (
      <span>
        Buy YES on {kalshiLink} + NO on {polymarketLink}
      </span>
    );
  }
  if (action.includes('YES on Polymarket')) {
    return (
      <span>
        Buy YES on {polymarketLink}, Sell on {kalshiLink}
      </span>
    );
  }
  if (action.includes('YES on Kalshi')) {
    return (
      <span>
        Buy YES on {kalshiLink}, Sell on {polymarketLink}
      </span>
    );
  }

  // Fallback: return action as-is
  return action;
}

export function OpportunitiesTable() {
  const { opportunities, meta, isLoading, error, refresh } = useOpportunities();

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500 mb-4">Failed to load opportunities</p>
        <Button onClick={refresh} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  if (isLoading && opportunities.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Loading opportunities...</p>
        <p className="text-sm text-muted-foreground mt-2">
          Initial scan may take 30-60 seconds
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-muted-foreground">
          {meta && (
            <>
              {meta.totalCount} opportunities | Last scan:{' '}
              {new Date(meta.scannedAt).toLocaleTimeString()}
            </>
          )}
        </div>
        <Button onClick={refresh} variant="outline" size="sm">
          Refresh
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Market</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Spread</TableHead>
              <TableHead>Action</TableHead>
              <TableHead className="text-right">Profit</TableHead>
              <TableHead className="text-right">Investment</TableHead>
              <TableHead>Liquidity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {opportunities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  No arbitrage opportunities found
                </TableCell>
              </TableRow>
            ) : (
              opportunities.map((opp) => (
                <TableRow key={opp.id}>
                  <TableCell className="p-2">
                    {opp.imageUrl ? (
                      <img
                        src={opp.imageUrl}
                        alt={opp.eventName}
                        width={40}
                        height={40}
                        className="rounded object-cover w-10 h-10"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                        N/A
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {opp.eventName}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate">
                    {opp.marketName}
                  </TableCell>
                  <TableCell>{getCategoryBadge(opp.category)}</TableCell>
                  <TableCell className={`text-right ${getSpreadColor(opp.spreadPct)}`}>
                    {formatPercent(opp.spreadPct)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatActionWithLinks(opp.action, opp.urls)}
                  </TableCell>
                  <TableCell className="text-right">
                    {opp.potentialProfit > 0
                      ? formatCurrency(opp.potentialProfit)
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {opp.maxInvestment > 0
                      ? formatCurrency(opp.maxInvestment)
                      : '-'}
                  </TableCell>
                  <TableCell>{getLiquidityBadge(opp)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
