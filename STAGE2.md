🧠 Claude Prompt: Stage 2 — Unified Market Normalization Layer

You are an expert TypeScript engineer building a production-grade prediction market arbitrage system.

Your task is to implement Stage 2: Unified Data Model + Platform Connectors.

This stage normalizes markets from Polymarket and Kalshi into a single unified schema.

🗂 Files to Create

You MUST output three complete files:

src/types/unified.ts

src/connectors/polymarket-connector.ts

src/connectors/kalshi-connector.ts

Each file must be fully implemented. Do not omit anything.

Responsibilities

Fetch Polymarket markets from their public API

Parse messy API responses defensively

Filter out:

Non-binary markets

Invalid or incomplete markets

Normalize prices:

Convert any 0–100 or 0–1 into 0–1 float

Group markets under UnifiedEvents

Populate:

IDs

Event titles

End times

Prices

Source URLs

If fields are missing:

Skip market

Do not crash

Engineering Rules

TypeScript only

Use fetch or axios

No any

Add comments explaining:

API assumptions

Field mappings

Normalization logic

Responsibilities

Fetch Kalshi events + markets

Parse API response defensively

Convert prices:

Kalshi uses cents (0–100) → divide by 100

Only keep:

Binary markets

Normalize to UnifiedEvent / UnifiedMarket

Skip malformed markets silently

Group markets by event

🧱 Architecture Rules

No UI code

No arbitrage logic

No side effects except fetching

Strong typing everywhere

Functions must be usable by downstream arbitrage engine

⚠️ IMPORTANT

If exact API fields are unknown:

Make reasonable assumptions

Document them clearly in comments

Write code that is easy to adapt

DO NOT:

Leave TODOs

Leave stub functions

Leave unimplemented logic