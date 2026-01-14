'use client';

import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useOpportunities } from '@/hooks/use-opportunities';
import type { Opportunity } from '@/types';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatTimeToResolution(dateStr: string | null): string {
  if (!dateStr) return '-';

  const now = Date.now();
  const target = new Date(dateStr).getTime();
  const diffMs = target - now;

  if (diffMs < 0) return 'Expired';

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  if (days === 0) {
    return `${remainingHours}h`;
  }
  if (remainingHours === 0) {
    return `${days}d`;
  }
  return `${days}d ${remainingHours}h`;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '-';

  const timestamp = new Date(dateStr).getTime();
  if (Number.isNaN(timestamp)) return '-';

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getCategoryBadge(category: string) {
  const categoryConfig: Record<string, { label: string; className: string }> = {
    sports: { label: 'Championships 🏆', className: 'bg-blue-700 text-white' },
    nba_game: { label: 'NBA 🏀', className: 'bg-orange-700 text-white' },
    weather: { label: 'Weather 🌤️', className: 'bg-sky-500' },
    finance: { label: 'Finance 💰', className: 'bg-emerald-500' },
    politics: { label: 'Politics 🇺🇸', className: 'bg-purple-500' },
    other: { label: 'Other 🌐', className: 'bg-gray-500' },
  };

  const config = categoryConfig[category] || categoryConfig.other;
  return <Badge className={config.className}>{config.label}</Badge>;
}

function getLiquidityBadge(opportunity: Opportunity) {
  const { status } = opportunity.liquidity;

  switch (status) {
    case 'available':
      return <Badge className="bg-green-700 text-white">Available</Badge>;
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
  if (spreadPct >= 1) return 'text-green-400';
  return '';
}

function formatSharePrice(price: number): string {
  return `${(Number(price) * 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}ct`;
}

function formatActionWithLinks(
  action: string,
  orderBook: { polyYesAsk: number; kalshiNoAsk: number; kalshiYesAsk: number; polyNoAsk: number } | null,
  urls: { polymarket: string | null; kalshi: string | null }
) {
  // Parse the action to create links
  // Actions like: "Buy YES on Polymarket + NO on Kalshi"
  const polymarketLink = urls.polymarket ? (
    <a
      href={urls.polymarket}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 hover:text-blue-300"
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
      className="text-blue-400 hover:text-blue-300"
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
        YES on {polymarketLink} {orderBook?.polyYesAsk ? `@ ${formatSharePrice(orderBook.polyYesAsk)}` : ''} + NO on {kalshiLink} {orderBook?.kalshiNoAsk ? `@ ${formatSharePrice(orderBook.kalshiNoAsk)}` : ''}
      </span>
    );
  }
  if (action.includes('YES on Kalshi') && action.includes('NO on Polymarket')) {
    return (
      <span>
        YES on {kalshiLink} {orderBook?.kalshiYesAsk ? `@ ${formatSharePrice(orderBook.kalshiYesAsk)}` : ''} + NO on {polymarketLink} {orderBook?.polyNoAsk ? `@ ${formatSharePrice(orderBook.polyNoAsk)}` : ''}
      </span>
    );
  }
  if (action.includes('YES on Polymarket')) {
    return (
      <span>
        Buy YES on {polymarketLink} {orderBook?.polyYesAsk ? `@ ${orderBook.polyYesAsk}` : ''}, Sell on {kalshiLink} {orderBook?.kalshiNoAsk ? `@ ${orderBook.kalshiNoAsk}` : ''}
      </span>
    );
  }
  if (action.includes('YES on Kalshi')) {
    return (
      <span>
        Buy YES on {kalshiLink} {orderBook?.kalshiYesAsk ? `@ ${orderBook.kalshiYesAsk}` : ''}, Sell on {polymarketLink} {orderBook?.polyNoAsk ? `@ ${orderBook.polyNoAsk}` : ''}
      </span>
    );
  }

  // Fallback: return action as-is
  return action;
}

export function OpportunitiesTable() {
  const { opportunities, meta, isLoading, isFetching, error, refresh } = useOpportunities();
  const [hideNonPositiveRoi, setHideNonPositiveRoi] = useState(true);

  // Sort by ROI descending (highest ROI first)
  const sortedOpportunities = [...opportunities].sort((a, b) => {
    const roiA = a.roi ?? -Infinity;
    const roiB = b.roi ?? -Infinity;
    return roiB - roiA;
  });

  // Filter by positive ROI if toggle is enabled
  const filteredOpportunities = hideNonPositiveRoi
    ? sortedOpportunities.filter((opp) => opp.roi !== null && opp.roi > 0)
    : sortedOpportunities;

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500 mb-4">Failed to load opportunities</p>
        <Button onClick={refresh} variant="outline" disabled={isFetching}>
          {isFetching && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
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
        <div className="flex items-center gap-6">
          <div className="text-sm text-muted-foreground">
            {meta && (
              <>
                {filteredOpportunities.length} of {meta.totalCount} opportunities | Last scan {formatRelativeTime(meta.scannedAt)}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="hide-non-positive"
              checked={hideNonPositiveRoi}
              onCheckedChange={setHideNonPositiveRoi}
            />
            <Label htmlFor="hide-non-positive" className="text-sm cursor-pointer">
              Hide non-profitable
            </Label>
          </div>
        </div>
        <Button onClick={refresh} variant="outline" size="sm" disabled={isFetching}>
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">{isFetching ? 'Refreshing...' : 'Refresh'}</span>
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
              <TableHead className="text-right">ROI</TableHead>
              <TableHead className="text-right">APR</TableHead>
              <TableHead>Resolution</TableHead>
              <TableHead>Liquidity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOpportunities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8">
                  No arbitrage opportunities found
                </TableCell>
              </TableRow>
            ) : (
              filteredOpportunities.map((opp) => (
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
                  <TableCell className="text-center">{getCategoryBadge(opp.category)}</TableCell>
                  <TableCell className={`text-right ${getSpreadColor(opp.spreadPct)}`}>
                    {formatPercent(opp.spreadPct)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatActionWithLinks(opp.action, opp.prices.orderBook, opp.urls)}
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
                  <TableCell className="text-right">
                    {opp.roi !== null ? formatPercent(opp.roi) : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {opp.apr !== null ? formatPercent(opp.apr) : '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatTimeToResolution(opp.timeToResolution)}
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
