/**
 * Base WebSocket Client for Prediction Markets
 *
 * Abstract base class that provides common WebSocket functionality
 * for both Kalshi and Polymarket clients.
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';

// ============ Types ============

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface BaseWebSocketEvents {
  connected: () => void;
  disconnected: (code: number, reason: string) => void;
  error: (error: Error) => void;
}

// ============ Abstract Base Class ============

export abstract class MarketWebSocketClient extends EventEmitter {
  protected ws: WebSocket | null = null;
  protected state: ConnectionState = 'disconnected';
  protected reconnectTimer: NodeJS.Timeout | null = null;
  protected shouldReconnect = true;
  protected readonly reconnectDelayMs: number = 5000;

  constructor() {
    super();
  }

  // ============ Abstract Methods ============

  /**
   * Get the WebSocket URL to connect to.
   */
  protected abstract getWebSocketUrl(): string;

  /**
   * Get connection options (e.g., auth headers).
   * Return undefined if no options needed.
   */
  protected abstract getConnectionOptions(): WebSocket.ClientOptions | undefined;

  /**
   * Called when WebSocket connection is established.
   * Subclasses should handle resubscription and other setup here.
   */
  protected abstract onConnected(): void;

  /**
   * Called when a message is received from the WebSocket.
   * @param data The raw message string
   */
  protected abstract onMessage(data: string): void;

  /**
   * Called when WebSocket connection is closed.
   * Subclasses should handle cleanup here.
   */
  protected abstract onDisconnected(): void;

  /**
   * Called to clear subscriptions when disconnecting.
   */
  protected abstract clearSubscriptions(): void;

  // ============ Public API ============

  /**
   * Connect to the WebSocket server.
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
   * Disconnect from the WebSocket server.
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.state = 'disconnected';
    this.clearSubscriptions();
  }

  /**
   * Get current connection state.
   */
  getState(): ConnectionState {
    return this.state;
  }

  // ============ Connection Management ============

  protected doConnect(): void {
    const url = this.getWebSocketUrl();
    const options = this.getConnectionOptions();

    this.ws = options ? new WebSocket(url, options) : new WebSocket(url);

    this.ws.on('open', () => {
      this.state = 'connected';
      this.emit('connected');
      this.onConnected();
    });

    this.ws.on('message', (data) => {
      this.onMessage(data.toString());
    });

    this.ws.on('ping', (data) => {
      this.ws?.pong(data);
    });

    this.ws.on('close', (code, reason) => {
      this.state = 'disconnected';
      this.ws = null;
      this.onDisconnected();
      this.emit('disconnected', code, reason.toString());

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (err) => {
      this.emit('error', err);
    });
  }

  protected scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.state = 'reconnecting';
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, this.reconnectDelayMs);
  }

  protected clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Send a message through the WebSocket.
   * @param data The data to send (will be JSON stringified if object)
   */
  protected send(data: string | object): void {
    if (this.ws && this.state === 'connected') {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      this.ws.send(message);
    }
  }
}
