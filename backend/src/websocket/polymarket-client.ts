/**
 * Polymarket WebSocket Client
 *
 * Provides real-time orderbook updates from Polymarket via WebSocket.
 * No authentication required for market channel (public data).
 */

import { MarketWebSocketClient } from './base-client.js';
import type {
  PolymarketOrderBookState,
  BookMessage,
  PriceChangeMessage,
  WebSocketMessage,
  PolymarketWebSocketEvents,
} from './polymarket-types.js';
import { parsePrice } from './polymarket-types.js';

// ============ Constants ============

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const PING_INTERVAL_MS = 10000;

// ============ Client Class ============

export class PolymarketWebSocketClient extends MarketWebSocketClient {
  private subscriptions = new Set<string>(); // asset IDs
  private orderbooks = new Map<string, PolymarketOrderBookState>();
  private pingTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  // ============ Abstract Method Implementations ============

  protected getWebSocketUrl(): string {
    return WS_URL;
  }

  protected getConnectionOptions(): undefined {
    return undefined; // No auth needed
  }

  protected onConnected(): void {
    this.startPing();

    // Send pending subscriptions
    if (this.subscriptions.size > 0) {
      this.send({
        assets_ids: Array.from(this.subscriptions),
        type: 'market',
      });
    }
  }

  protected onMessage(data: string): void {
    // Handle non-JSON responses (PONG, errors, etc.)
    if (data === 'PONG' || data === 'INVALID OPERATION') {
      return;
    }

    try {
      const parsed = JSON.parse(data);
      // Handle both array format and single object format
      const messages = Array.isArray(parsed) ? parsed : [parsed];
      for (const msg of messages) {
        this.handleMessage(msg as WebSocketMessage);
      }
    } catch (err) {
      this.emit('error', new Error(`Failed to parse message: ${err}`));
    }
  }

  protected onDisconnected(): void {
    this.stopPing();
  }

  protected clearSubscriptions(): void {
    this.subscriptions.clear();
  }

  // ============ Public API ============

  /**
   * Subscribe to orderbook updates for a token.
   */
  subscribe(assetId: string): void {
    if (this.subscriptions.has(assetId)) {
      return; // Already subscribed
    }

    if (this.state !== 'connected' || !this.ws) {
      // Queue subscription for when connected
      this.subscriptions.add(assetId);
      return;
    }

    this.send({
      assets_ids: [assetId],
      type: 'market',
    });
    this.subscriptions.add(assetId);
  }

  /**
   * Subscribe to orderbook updates for multiple tokens.
   */
  subscribeMany(assetIds: string[]): void {
    const newIds = assetIds.filter((id) => !this.subscriptions.has(id));
    if (newIds.length === 0) return;

    // Add to subscriptions set
    newIds.forEach((id) => this.subscriptions.add(id));

    if (this.state !== 'connected' || !this.ws) {
      // Will be sent on connect
      return;
    }

    this.send({
      assets_ids: newIds,
      type: 'market',
    });
  }

  /**
   * Unsubscribe from orderbook updates for a token.
   */
  unsubscribe(assetId: string): void {
    if (!this.subscriptions.has(assetId)) {
      return;
    }

    if (this.state === 'connected' && this.ws) {
      this.send({
        assets_ids: [assetId],
        operation: 'unsubscribe',
      });
    }

    this.subscriptions.delete(assetId);
    this.orderbooks.delete(assetId);
  }

  /**
   * Get current orderbook state for a token.
   */
  getOrderbook(assetId: string): PolymarketOrderBookState | undefined {
    return this.orderbooks.get(assetId);
  }

  /**
   * Get all current orderbook states.
   */
  getAllOrderbooks(): Map<string, PolymarketOrderBookState> {
    return new Map(this.orderbooks);
  }

  /**
   * Get all subscribed asset IDs.
   */
  getSubscribedAssets(): string[] {
    return Array.from(this.subscriptions);
  }

  // ============ Keep-Alive ============

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.state === 'connected') {
        this.send('PING');
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  // ============ Message Handling ============

  private handleMessage(msg: WebSocketMessage): void {
    // Some messages may not have event_type, detect by fields present
    const eventType = msg.event_type || this.detectMessageType(msg as Record<string, unknown>);

    switch (eventType) {
      case 'book':
        this.handleBook(msg as BookMessage);
        break;
      case 'price_change':
        this.handlePriceChange(msg as PriceChangeMessage);
        break;
      default:
        // Ignore other message types (tick_size_change, last_trade_price, etc.)
        break;
    }
  }

  private detectMessageType(msg: Record<string, unknown>): string | undefined {
    // book message has bids and asks arrays
    if ('bids' in msg && 'asks' in msg) {
      return 'book';
    }
    // price_change has price_changes array
    if ('price_changes' in msg) {
      return 'price_change';
    }
    return undefined;
  }

  private handleBook(msg: BookMessage): void {
    const { asset_id, market, bids, asks } = msg;

    const orderbook: PolymarketOrderBookState = {
      assetId: asset_id,
      conditionId: market,
      bids: new Map(),
      asks: new Map(),
      updatedAt: new Date(),
    };

    // Parse bids
    for (const { price, size } of bids) {
      const priceInt = parsePrice(price);
      const sizeNum = parseFloat(size);
      if (sizeNum > 0) {
        orderbook.bids.set(priceInt, sizeNum);
      }
    }

    // Parse asks
    for (const { price, size } of asks) {
      const priceInt = parsePrice(price);
      const sizeNum = parseFloat(size);
      if (sizeNum > 0) {
        orderbook.asks.set(priceInt, sizeNum);
      }
    }

    this.orderbooks.set(asset_id, orderbook);
    this.emit('subscribed', asset_id);
    this.emit('book', asset_id, orderbook);
    this.emit('orderbook', asset_id, orderbook);
  }

  private handlePriceChange(msg: PriceChangeMessage): void {
    for (const change of msg.price_changes) {
      const { asset_id, price, size, side } = change;

      const orderbook = this.orderbooks.get(asset_id);
      if (!orderbook) continue;

      const priceInt = parsePrice(price);
      const sizeNum = parseFloat(size);
      const book = side === 'BUY' ? orderbook.bids : orderbook.asks;

      if (sizeNum <= 0) {
        book.delete(priceInt);
      } else {
        book.set(priceInt, sizeNum);
      }

      orderbook.updatedAt = new Date();

      this.emit('price_change', asset_id, side, priceInt, sizeNum);
      this.emit('orderbook', asset_id, orderbook);
    }
  }
}

// ============ Type-safe Event Emitter ============

export interface PolymarketWebSocketClient {
  on<E extends keyof PolymarketWebSocketEvents>(
    event: E,
    listener: PolymarketWebSocketEvents[E]
  ): this;
  once<E extends keyof PolymarketWebSocketEvents>(
    event: E,
    listener: PolymarketWebSocketEvents[E]
  ): this;
  emit<E extends keyof PolymarketWebSocketEvents>(
    event: E,
    ...args: Parameters<PolymarketWebSocketEvents[E]>
  ): boolean;
}
