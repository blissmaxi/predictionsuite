/**
 * Kalshi WebSocket Types
 */

// ============ Connection ============

export interface KalshiCredentials {
  apiKey: string;
  privateKey: string;
}

// ============ Commands ============

export interface SubscribeCommand {
  id: number;
  cmd: 'subscribe';
  params: {
    channels: string[];
    market_ticker?: string;
    market_tickers?: string[];
  };
}

export interface UnsubscribeCommand {
  id: number;
  cmd: 'unsubscribe';
  params: {
    sids: number[];
  };
}

export type WebSocketCommand = SubscribeCommand | UnsubscribeCommand;

// ============ Messages ============

export interface SubscribedMessage {
  type: 'subscribed';
  sid: number;
  msg: {
    channel: string;
    market_ticker?: string;
  };
}

export interface ErrorMessage {
  type: 'error';
  msg: {
    code: number;
    message: string;
  };
}

export interface OrderBookSnapshot {
  type: 'orderbook_snapshot';
  sid: number;
  seq: number;
  msg: {
    market_ticker: string;
    yes: Array<[number, number]>;  // [price_cents, quantity]
    no: Array<[number, number]>;
    yes_dollars?: Array<[string, number]>;
    no_dollars?: Array<[string, number]>;
  };
}

export interface OrderBookDelta {
  type: 'orderbook_delta';
  sid: number;
  seq: number;
  msg: {
    market_ticker: string;
    price: number;
    delta: number;
    side: 'yes' | 'no';
  };
}

export type WebSocketMessage =
  | SubscribedMessage
  | ErrorMessage
  | OrderBookSnapshot
  | OrderBookDelta
  | { type: string; [key: string]: unknown };

// ============ Orderbook State ============

export interface OrderBookLevel {
  price: number;  // in cents (1-99)
  quantity: number;
}

export interface OrderBookState {
  marketTicker: string;
  yes: Map<number, number>;  // price_cents -> quantity
  no: Map<number, number>;
  lastSeq: number;
  updatedAt: Date;
}

// ============ Events ============

export interface KalshiWebSocketEvents {
  connected: () => void;
  disconnected: (code: number, reason: string) => void;
  error: (error: Error) => void;
  subscribed: (marketTicker: string, sid: number) => void;
  snapshot: (marketTicker: string, orderbook: OrderBookState) => void;
  delta: (marketTicker: string, side: 'yes' | 'no', price: number, delta: number, newQuantity: number) => void;
  orderbook: (marketTicker: string, orderbook: OrderBookState) => void;
}
