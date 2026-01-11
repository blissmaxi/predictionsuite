# CLAUDE.md

Project Name: PolyOracle (Prediction Market Toolkit)
Goal: Automated arbitrage bot that identifies and executes risk-free trades between Polymarket (crypto prediction market) and Kalshi (regulated prediction market) by exploiting price discrepancies on the same events.

## Possible APIs:

Polymarket Gamma API: For markets/events data.
Polymarket CLOB API: For order book depth and execution.
Polymarket CLOB API: https://docs.polymarket.com/
Kalshi API: https://kalshi-public-docs.s3.amazonaws.com/

## Architecture

Its important that you use components and keep the code clean and modular. use descriptive names for files and classes.


```
┌─────────────────────────────────────────────────────────────┐
│                     ARBITRAGE BOT                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐         ┌──────────────┐                │
│  │   Polymarket │         │    Kalshi    │                │
│  │   Connector  │         │   Connector  │                │
│  └──────┬───────┘         └──────┬───────┘                │
│         │                        │                         │
│         └────────┬───────────────┘                         │
│                  │                                          │
│         ┌────────▼─────────┐                               │
│         │  Event Matcher   │                               │
│         │  (fuzzy match)   │                               │
│         └────────┬─────────┘                               │
│                  │                                          │
│         ┌────────▼─────────┐                               │
│         │ Arbitrage Engine │                               │
│         │  (calc spreads)  │                               │
│         └────────┬─────────┘                               │
│                  │                                          │
│         ┌────────▼─────────┐                               │
│         │ Execution Engine │                               │
│         │  (place orders)  │                               │
│         └────────┬─────────┘                               │
│                  │                                          │
│         ┌────────▼─────────┐                               │
│         │ Position Manager │                               │
│         │ (track holdings) │                               │
│         └──────────────────┘                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

The project shall be node/typesript based

## Todos:

Stage 1: Build a lightweight scripts that expore the prediction market APIs (Polymarket and Kalshi) to learn about their capabilites and datamodels.
Stage 2: Build a datamodel, that fits the two predictionmarkets so we can efficiently identify arbs