# Arbitrage Opportunity UI -- Design System & Component Spec

This document describes a **single core UI component**
(`ArbOpportunityCard`) and the **design system** around it for an online
terminal that surfaces arbitrage opportunities on prediction markets.

It is written so a developer (or Claude Code) can implement it directly
in React/Next + Tailwind or similar.

------------------------------------------------------------------------

## 1. Design System

### 1.1 Layout & Density

-   Default density: **compact**; each collapsed row \~120--160px
    height.
-   Information hierarchy:
    1.  Profit + spread + type badge (signal)
    2.  Action (what to trade)
    3.  Prices/fees (why it works)
    4.  Constraints (max invest, liquidity)
    5.  Metadata (last updated, resolution)

### 1.2 Color Tokens (Dark Terminal)

Use semantic tokens, not raw colors:

    --bg:        #0B0F14
    --panel:     #0F1620
    --panel-2:   #111B26
    --text:      #E6EDF3
    --muted:     #97A3B3
    --border:    rgba(255,255,255,0.08)
    --positive:  #3DDC97
    --warning:   #F7C948
    --danger:    #FF5C5C
    --info:      #6AA9FF

Mappings: - `type = guaranteed` → positive - `type = risk` → warning -
`liquidity.status = limited` → warning -
`liquidity.status = unavailable` → danger

### 1.3 Typography

-   Use **tabular numbers** for all prices, dollars, and percentages.
-   Primary stat weight: 600--700.
-   Secondary/muted text: 400--500.

### 1.4 Spacing & Shape

-   Card padding: 12--14px
-   Internal gaps: 8px
-   Section gaps: 12px
-   Border radius: 12px
-   Border: 1px solid `--border`

### 1.5 Interaction Rules

-   Entire card is clickable to expand/collapse (except buttons/links).
-   If `now - lastUpdated > 60s` → show **STALE** badge.
-   Copy-to-clipboard for:
    -   Action line
    -   Full order summary

------------------------------------------------------------------------

## 2. Core Component: `ArbOpportunityCard`

### 2.1 Data Type (from backend)

``` ts
type ArbOpportunity = {
  id: string
  eventName: string
  marketName: string
  category: string
  imageUrl?: string
  type: "guaranteed" | "risk" | string
  spreadPct: number
  action: string
  potentialProfit: number
  maxInvestment: number
  timeToResolution: string
  fees: Record<string, number>
  prices: {
    polymarket?: { yes: number; no: number }
    kalshi?: { yes: number; no: number }
    orderBook?: {
      polyYesAsk?: number
      kalshiNoAsk?: number
      totalCost?: number
      profitPct?: number
    }
  }
  urls: Record<string, string>
  liquidity: { status: "available" | "limited" | "unavailable"; limitedBy?: string }
  lastUpdated: string
}
```

### 2.2 Props

``` ts
type ArbOpportunityCardProps = {
  opportunity: ArbOpportunity
  defaultExpanded?: boolean
  onExecute?: (id: string) => void
  onPin?: (id: string, pinned: boolean) => void
}
```

------------------------------------------------------------------------

## 3. Visual Structure

### 3.1 Collapsed State (Scan View)

**Left:** - Market avatar (image or category fallback)

**Center:** - Event name (small, muted) - Market name (primary) - Action
line: "Trade: Buy YES on ..." (1 line, truncated) - Copy icon

**Right:** - Big stat: `+${potentialProfit}` - Subline:
`Spread {spreadPct}% · Max ${maxInvestment}` - Resolution time:
"Resolves in 168d" or date

**Footer micro row:** - Liquidity pill (Available / Limited /
Unavailable) - "Updated 12s ago" or **STALE** badge

Click anywhere (except buttons) expands the card.

### 3.2 Expanded State

Adds:

1)  **Price Tables** (per venue)\
2)  **Order Book Summary**\
3)  **Execution Bar** (deep links + copy summary)

------------------------------------------------------------------------

## 4. Subcomponents

### 4.1 `Badge`

-   Variants: `neutral | positive | warning | danger | info`
-   Small size only
-   Rounded-full, subtle background + border

### 4.2 `MarketAvatar`

-   Props: `imageUrl?, category, alt`
-   If no image: show category initials in gradient box

### 4.3 `Stat`

-   Displays label + value
-   Always tabular numbers

### 4.4 `VenuePriceTable`

For each venue (Polymarket, Kalshi):

-   Header: Venue name + small "Fee X%" badge
-   Rows:
    -   YES: price
    -   NO: price
-   If missing data: show "---"

### 4.5 `OrderBookSummary`

Shows 3--4 stat chips: - `polyYesAsk` - `kalshiNoAsk` - `totalCost` -
`profitPct` (prefer backend value if provided)

### 4.6 `ExecuteBar`

Buttons: - Primary: **Open & Execute** - Secondary: **Copy order
summary** - Tertiary: - Open Polymarket (external link) - Open Kalshi
(external link) - Optional: Pin icon toggle

**Copied summary format:**

    Buy YES on Polymarket @ {polyYesAsk}
    Buy NO on Kalshi @ {kalshiNoAsk}
    Total cost: {totalCost}
    Expected profit: {profitPct}%
    Max size: ${maxInvestment}

### 4.7 `ResolutionTime`

-   Future: "Resolves in 168d" (hover shows exact date)
-   Past: "Resolved" badge

### 4.8 `LiquidityPill`

-   available → green
-   limited → yellow + tooltip "limited by {limitedBy}"
-   unavailable → red

------------------------------------------------------------------------

## 5. Layout Blueprint (Pseudo-React)

``` tsx
<CardRoot onClick={toggleExpanded}>
  <div className="flex gap-3">
    <MarketAvatar />

    <div className="flex-1 min-w-0">
      {/* Header */}
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted">{eventName}</div>
          <div className="text-sm font-semibold truncate">{marketName}</div>
        </div>

        <div className="flex gap-2">
          <Badge variant="info">{category}</Badge>
          <TypeBadge type={type} />
          <Chevron expanded={expanded} />
        </div>
      </div>

      {/* Action */}
      <div className="mt-2 flex gap-2 min-w-0">
        <span className="text-xs text-muted">Trade:</span>
        <span className="font-mono truncate">{action}</span>
        <CopyButton />
      </div>

      {/* Bottom */}
      <div className="mt-3 flex justify-between">
        <div className="flex gap-2 flex-wrap">
          <LiquidityPill />
          <LastUpdated />
          {stale && <Badge variant="warning">STALE</Badge>}
        </div>

        <div className="text-right">
          <div className="text-lg font-bold text-positive">
            +${potentialProfit}
          </div>
          <div className="text-xs text-muted">
            Spread {spreadPct}% · Max ${maxInvestment}
          </div>
          <ResolutionTime />
        </div>
      </div>
    </div>
  </div>

  {expanded && (
    <div className="mt-4 border-t pt-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <VenuePriceTable venue="Polymarket" />
        <VenuePriceTable venue="Kalshi" />
      </div>

      <OrderBookSummary />
      <ExecuteBar />
    </div>
  )}
</CardRoot>
```

------------------------------------------------------------------------

## 6. Formatting & Logic Rules

### 6.1 Number Formatting

-   Prices: 3 decimals (0.208)
-   Dollar values: 2 decimals + separators
-   Percentages: 0--2 decimals

### 6.2 Staleness

``` ts
stale = Date.now() - new Date(lastUpdated).getTime() > 60_000
```

### 6.3 Safety & Edge Cases

-   If a venue URL is missing: disable its button + tooltip "No link
    available"
-   If `liquidity.status === "limited"`:
    -   Show warning: "Limited by {limitedBy}. Size may not fill at
        shown prices."
-   If `type !== "guaranteed"`:
    -   Show note: "Check settlement conditions."

------------------------------------------------------------------------

## 7. Aesthetic Touches

-   Subtle hover border highlight
-   Profit number pulses briefly when it changes
-   Expand/collapse animation: 150--200ms ease

------------------------------------------------------------------------

## 8. Optional: Dense Table View

This same component can be adapted into a **row-based terminal table**
where each row: - Shows: Market \| Action \| Profit \| Spread \| Max \|
Liquidity - Clicking a row expands it into the full `ArbOpportunityCard`
detail view below it.

------------------------------------------------------------------------

**End of spec.**
