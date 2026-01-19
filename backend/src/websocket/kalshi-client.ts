/**
 * Kalshi WebSocket Client
 *
 * Provides real-time orderbook updates from Kalshi via WebSocket.
 * Handles authentication, connection management, and orderbook state.
 */

import WebSocket from 'ws';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { MarketWebSocketClient } from './base-client.js';
import type {
  KalshiCredentials,
  OrderBookState,
  OrderBookSnapshot,
  OrderBookDelta,
  WebSocketMessage,
  KalshiWebSocketEvents,
} from './kalshi-types.js';

// ============ Constants ============

const WS_URL = 'wss://api.elections.kalshi.com/trade-api/ws/v2';
const WS_PATH = '/trade-api/ws/v2';

// ============ Client Class ============

export class KalshiWebSocketClient extends MarketWebSocketClient {
  private credentials: KalshiCredentials;
  private commandId = 0;
  private subscriptions = new Map<string, number>(); // marketTicker -> sid
  private orderbooks = new Map<string, OrderBookState>();

  constructor(credentials?: KalshiCredentials) {
    super();
    this.credentials = credentials || this.loadCredentialsFromEnv();
  }

  // ============ Abstract Method Implementations ============

  protected getWebSocketUrl(): string {
    return WS_URL;
  }

  protected getConnectionOptions(): WebSocket.ClientOptions {
    return { headers: this.getAuthHeaders() };
  }

  protected onConnected(): void {
    // Resubscribe to any previously subscribed markets
    const markets = Array.from(this.subscriptions.keys());
    this.subscriptions.clear();
    for (const market of markets) {
      this.subscribe(market);
    }
  }

  protected onMessage(data: string): void {
    try {
      const msg = JSON.parse(data) as WebSocketMessage;
      this.handleMessage(msg);
    } catch (err) {
      this.emit('error', new Error(`Failed to parse message: ${err}`));
    }
  }

  protected onDisconnected(): void {
    // No additional cleanup needed
  }

  protected clearSubscriptions(): void {
    this.subscriptions.clear();
  }

  // ============ Public API ============

  /**
   * Subscribe to orderbook updates for a market.
   */
  subscribe(marketTicker: string): void {
    if (this.subscriptions.has(marketTicker)) {
      return; // Already subscribed
    }

    if (this.state !== 'connected' || !this.ws) {
      // Queue subscription for when connected
      this.once('connected', () => this.subscribe(marketTicker));
      return;
    }

    const cmd = {
      id: ++this.commandId,
      cmd: 'subscribe',
      params: {
        channels: ['orderbook_delta'],
        market_ticker: marketTicker,
      },
    };

    this.send(cmd);
  }

  /**
   * Subscribe to orderbook updates for multiple markets.
   */
  subscribeMany(marketTickers: string[]): void {
    // Filter out already subscribed markets
    const newTickers = marketTickers.filter((t) => !this.subscriptions.has(t));
    if (newTickers.length === 0) return;

    if (this.state !== 'connected' || !this.ws) {
      // Queue subscription for when connected
      this.once('connected', () => this.subscribeMany(newTickers));
      return;
    }

    // Kalshi supports subscribing to multiple markets in one command
    const cmd = {
      id: ++this.commandId,
      cmd: 'subscribe',
      params: {
        channels: ['orderbook_delta'],
        market_tickers: newTickers,
      },
    };

    this.send(cmd);
  }

  /**
   * Unsubscribe from orderbook updates for a market.
   */
  unsubscribe(marketTicker: string): void {
    const sid = this.subscriptions.get(marketTicker);
    if (!sid || this.state !== 'connected' || !this.ws) {
      return;
    }

    const cmd = {
      id: ++this.commandId,
      cmd: 'unsubscribe',
      params: {
        sids: [sid],
      },
    };

    this.send(cmd);
    this.subscriptions.delete(marketTicker);
    this.orderbooks.delete(marketTicker);
  }

  /**
   * Get current orderbook state for a market.
   */
  getOrderbook(marketTicker: string): OrderBookState | undefined {
    return this.orderbooks.get(marketTicker);
  }

  /**
   * Get all current orderbook states.
   */
  getAllOrderbooks(): Map<string, OrderBookState> {
    return new Map(this.orderbooks);
  }

  /**
   * Get all subscribed market tickers.
   */
  getSubscribedMarkets(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  // ============ Message Handling ============

  private handleMessage(msg: WebSocketMessage): void {
    switch (msg.type) {
      case 'subscribed':
        this.handleSubscribed(msg as unknown as { sid?: number; msg?: { market_ticker?: string } });
        break;
      case 'orderbook_snapshot':
        this.handleSnapshot(msg as OrderBookSnapshot);
        break;
      case 'orderbook_delta':
        this.handleDelta(msg as OrderBookDelta);
        break;
      case 'error':
        this.emit('error', new Error(`Kalshi error: ${JSON.stringify((msg as any).msg)}`));
        break;
    }
  }

  private handleSubscribed(msg: { sid?: number; msg?: { market_ticker?: string } }): void {
    const sid = msg.sid;
    const marketTicker = msg.msg?.market_ticker;

    if (sid && marketTicker) {
      this.subscriptions.set(marketTicker, sid);
      this.emit('subscribed', marketTicker, sid);
    }
  }

  private handleSnapshot(msg: OrderBookSnapshot): void {
    if (!msg.msg) {
      return; // No message payload
    }

    const { market_ticker, yes, no } = msg.msg;
    const seq = msg.seq;

    if (!market_ticker || !yes || !no) {
      return; // Incomplete snapshot, skip
    }

    const orderbook: OrderBookState = {
      marketTicker: market_ticker,
      yes: new Map(yes.map(([price, qty]) => [price, qty])),
      no: new Map(no.map(([price, qty]) => [price, qty])),
      lastSeq: seq,
      updatedAt: new Date(),
    };

    this.orderbooks.set(market_ticker, orderbook);
    this.emit('snapshot', market_ticker, orderbook);
    this.emit('orderbook', market_ticker, orderbook);
  }

  private handleDelta(msg: OrderBookDelta): void {
    if (!msg.msg) {
      return; // No message payload
    }

    console.log('handleDelta', msg.msg);
    const { market_ticker, price, delta, side } = msg.msg;
    const seq = msg.seq;

    const orderbook = this.orderbooks.get(market_ticker);
    if (!orderbook) return;

    const book = side === 'yes' ? orderbook.yes : orderbook.no;
    const current = book.get(price) || 0;
    const newQuantity = current + delta;

    if (newQuantity <= 0) {
      book.delete(price);
    } else {
      book.set(price, newQuantity);
    }

    orderbook.lastSeq = seq;
    orderbook.updatedAt = new Date();

    this.emit('delta', market_ticker, side, price, delta, Math.max(0, newQuantity));
    this.emit('orderbook', market_ticker, orderbook);
  }

  // ============ Authentication ============

  private loadCredentialsFromEnv(): KalshiCredentials {
    const apiKey = process.env.KALSHI_API_ID;
    if (!apiKey) {
      throw new Error('KALSHI_API_ID not found in environment variables');
    }

    const keyPath = path.join(process.cwd(), 'kalshi-api-rsa');
    if (!fs.existsSync(keyPath)) {
      throw new Error(`Private key file not found: ${keyPath}`);
    }

    const privateKey = fs.readFileSync(keyPath, 'utf-8');
    return { apiKey, privateKey };
  }

  private getAuthHeaders(): Record<string, string> {
    const timestamp = Date.now().toString();
    const message = timestamp + 'GET' + WS_PATH;

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(message);
    sign.end();

    const signature = sign.sign({
      key: this.credentials.privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    });

    return {
      'KALSHI-ACCESS-KEY': this.credentials.apiKey,
      'KALSHI-ACCESS-SIGNATURE': signature.toString('base64'),
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
    };
  }
}

// ============ Type-safe Event Emitter ============

export interface KalshiWebSocketClient {
  on<E extends keyof KalshiWebSocketEvents>(
    event: E,
    listener: KalshiWebSocketEvents[E]
  ): this;
  once<E extends keyof KalshiWebSocketEvents>(
    event: E,
    listener: KalshiWebSocketEvents[E]
  ): this;
  emit<E extends keyof KalshiWebSocketEvents>(
    event: E,
    ...args: Parameters<KalshiWebSocketEvents[E]>
  ): boolean;
}
