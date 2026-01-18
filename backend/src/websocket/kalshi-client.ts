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
import { EventEmitter } from 'events';
import type {
  KalshiCredentials,
  ConnectionState,
  OrderBookState,
  OrderBookSnapshot,
  OrderBookDelta,
  WebSocketMessage,
  KalshiWebSocketEvents,
} from './types.js';

// ============ Constants ============

const WS_URL = 'wss://api.elections.kalshi.com/trade-api/ws/v2';
const WS_PATH = '/trade-api/ws/v2';
const RECONNECT_DELAY_MS = 5000;

// ============ Client Class ============

export class KalshiWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private credentials: KalshiCredentials;
  private state: ConnectionState = 'disconnected';
  private commandId = 0;
  private subscriptions = new Map<string, number>(); // marketTicker -> sid
  private orderbooks = new Map<string, OrderBookState>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private shouldReconnect = true;

  constructor(credentials?: KalshiCredentials) {
    super();
    this.credentials = credentials || this.loadCredentialsFromEnv();
  }

  // ============ Public API ============

  /**
   * Connect to Kalshi WebSocket.
   */
  connect(): void {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.shouldReconnect = true;
    this.state = 'connecting';
    this.doConnect();
  }

  /**
   * Disconnect from Kalshi WebSocket.
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.state = 'disconnected';
    this.subscriptions.clear();
  }

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

    this.ws.send(JSON.stringify(cmd));
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

    this.ws.send(JSON.stringify(cmd));
  }

  /**
   * Get all current orderbook states.
   */
  getAllOrderbooks(): Map<string, OrderBookState> {
    return new Map(this.orderbooks);
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

    this.ws.send(JSON.stringify(cmd));
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
   * Get all subscribed market tickers.
   */
  getSubscribedMarkets(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Get current connection state.
   */
  getState(): ConnectionState {
    return this.state;
  }

  // ============ Connection Management ============

  private doConnect(): void {
    const headers = this.getAuthHeaders();

    this.ws = new WebSocket(WS_URL, { headers });

    this.ws.on('open', () => {
      this.state = 'connected';
      this.emit('connected');

      // Resubscribe to any previously subscribed markets
      const markets = Array.from(this.subscriptions.keys());
      this.subscriptions.clear();
      for (const market of markets) {
        this.subscribe(market);
      }
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WebSocketMessage;
        this.handleMessage(msg);
      } catch (err) {
        this.emit('error', new Error(`Failed to parse message: ${err}`));
      }
    });

    this.ws.on('ping', (data) => {
      this.ws?.pong(data);
    });

    this.ws.on('close', (code, reason) => {
      this.state = 'disconnected';
      this.ws = null;
      this.emit('disconnected', code, reason.toString());

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (err) => {
      this.emit('error', err);
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.state = 'reconnecting';
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, RECONNECT_DELAY_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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
    const { market_ticker, yes, no } = msg.msg;
    const seq = msg.seq;

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
