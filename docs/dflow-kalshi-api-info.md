Prediction Markets
Discover Prediction Market Tokens
How to find on-chain prediction markets using the DFlow Prediction Market Metadata API

This guide shows you how to explore on-chain prediction markets utilizing the DFlow Prediction Market Metadata API, and accessing their token addresses for trading.
This quickstart demonstrates how to use the Prediction Market Metadata API to build discovery UIs. For trading tokens, see the Trade Tokens guide.
​
Overview
The DFlow Prediction Market Metadata API includes multiple ways to discover prediction market outcome tokens:
Fetch all events
Fetch events by market status
Get events by relevant categories and tags
1
Fetch Events with Nested Markets

Use the /api/v1/events endpoint with withNestedMarkets=true to retrieve events along with their associated markets. Each market contains token addresses in the accounts field that you can use for trading.
Get All Events with Markets

/// Base URL for the DFlow Prediction Market Metadata API
const METADATA_API_BASE_URL = "https://prediction-markets-api.dflow.net";

/// Fetch events with nested markets included
const response = await fetch(
  `${METADATA_API_BASE_URL}/api/v1/events?withNestedMarkets=true&limit=200`,
  {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }
);

if (!response.ok) {
  throw new Error("Failed to fetch events");
}

const data = await response.json();
const events = data.events;

/// Log details of each event and nested markets
events.forEach((event: any) => {
  console.log("Event:", {
    ticker: event.ticker,
    title: event.title,
    subtitle: event.subtitle,
    seriesTicker: event.seriesTicker,
  });

  if (event.markets && event.markets.length > 0) {
    event.markets.forEach((market: any) => {
      const accounts = market.accounts;
      const accountValues = Object.values(accounts);

      console.log("  Market:", {
        ticker: market.ticker,
        title: market.title,
        status: market.status,
        accounts: accountValues.map((account: any) => ({
          yesMint: account.yesMint,
          noMint: account.noMint,
        })),
      });
    });
  }
});
2
Fetch Events by Market Status

Use the status filter on /api/v1/events endpoint to retrieve and markets that are actively available for trading or markets that are coming soon.
Get Events with Open Markets

/// Base URL for the DFlow Prediction Market Metadata API
const METADATA_API_BASE_URL = "https://prediction-markets-api.dflow.net";

/// Fetch events with nested markets included
const response = await fetch(
  `${METADATA_API_BASE_URL}/api/v1/events?withNestedMarkets=true&status=active&limit=200`,
  {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }
);

if (!response.ok) {
  throw new Error("Failed to fetch events");
}

const data = await response.json();
const events = data.events;

/// Log details of each event and nested markets
events.forEach((event: any) => {
  console.log("Event:", {
    ticker: event.ticker,
    title: event.title,
    subtitle: event.subtitle,
    seriesTicker: event.seriesTicker,
  });

  if (event.markets && event.markets.length > 0) {
    event.markets.forEach((market: any) => {
      const accounts = market.accounts;
      const accountValues = Object.values(accounts);

      console.log("  Market:", {
        ticker: market.ticker,
        title: market.title,
        status: market.status,
        accounts: accountValues.map((account: any) => ({
          yesMint: account.yesMint,
          noMint: account.noMint,
        })),
      });
    });
  }
});
Get Events with Initialized Markets

/// Base URL for the DFlow Prediction Market Metadata API
const METADATA_API_BASE_URL = "https://prediction-markets-api.dflow.net";

/// Fetch events with nested markets included
const response = await fetch(
  `${METADATA_API_BASE_URL}/api/v1/events?withNestedMarkets=true&status=initialized&limit=200`,
  {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }
);

if (!response.ok) {
  throw new Error("Failed to fetch events");
}

const data = await response.json();
const events = data.events;

/// Log details of each event and nested markets
events.forEach((event: any) => {
  console.log("Event:", {
    ticker: event.ticker,
    title: event.title,
    subtitle: event.subtitle,
    seriesTicker: event.seriesTicker,
  });

  if (event.markets && event.markets.length > 0) {
    event.markets.forEach((market: any) => {
      const accounts = market.accounts;
      const accountValues = Object.values(accounts);

      console.log("  Market:", {
        ticker: market.ticker,
        title: market.title,
        status: market.status,
        accounts: accountValues.map((account: any) => ({
          yesMint: account.yesMint,
          noMint: account.noMint,
        })),
      });
    });
  }
});
3
Get Events by Categories and Tags

Use categories tags to filter series and find relevant events and markets. This approach involves: (1) retrieving available tags organized by category, (2) filtering series by tags or categories, and (3) fetching events filtered by series tickers (comma-separated) to discover markets.
Get Categories and Tags

Filter Series by Category and Tags

Get Events Filtered by Series Tickers

​
API Response Structure
​
Events Response
The events endpoint returns:
Event Information: Ticker, title, subtitle, series ticker
Nested Markets (when withNestedMarkets=true): Array of markets with:
Market ticker, title, status
Accounts: Object containing yesMint and noMint token addresses
Volume, open interest, timing information
​
Tags by Categories Response
Returns a mapping of categories to arrays of tags:
{
  "tagsByCategories": {
    "Sports": ["Football", "Soccer", "Basketball", "Hockey", "Baseball", "NFL"],
    "Crypto": ["Pre-Market", "SOL", "BTC", "ETH", "SHIBA", "Dogecoin"]
  }
}
​
Series Response
Returns series templates with:
Ticker: Used to filter events
Title: Human-readable series name
Category: Series category
Tags: Array of associated tags
Frequency: How often events in this series occur