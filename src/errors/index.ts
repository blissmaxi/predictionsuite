/**
 * Error Types
 *
 * Lightweight typed errors for better debugging and error handling.
 * These extend Error to preserve stack traces while adding context.
 */

/** Base error for all prediction market errors */
export class PredictionMarketError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PredictionMarketError';
  }
}

/** Error fetching data from an API */
export class ApiError extends PredictionMarketError {
  constructor(
    message: string,
    public readonly platform: 'polymarket' | 'kalshi',
    public readonly statusCode?: number,
    context?: Record<string, unknown>
  ) {
    super(message, 'API_ERROR', { platform, statusCode, ...context });
    this.name = 'ApiError';
  }
}

/** Error parsing or validating market data */
export class DataValidationError extends PredictionMarketError {
  constructor(
    message: string,
    public readonly field: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'VALIDATION_ERROR', { field, ...context });
    this.name = 'DataValidationError';
  }
}

/** Error in matching logic */
export class MatchingError extends PredictionMarketError {
  constructor(
    message: string,
    public readonly matchType: 'event' | 'market',
    context?: Record<string, unknown>
  ) {
    super(message, 'MATCHING_ERROR', { matchType, ...context });
    this.name = 'MatchingError';
  }
}

/** Error in arbitrage calculation */
export class ArbitrageError extends PredictionMarketError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'ARBITRAGE_ERROR', context);
    this.name = 'ArbitrageError';
  }
}

/**
 * Type guard to check if an error is a PredictionMarketError
 */
export function isPredictionMarketError(
  error: unknown
): error is PredictionMarketError {
  return error instanceof PredictionMarketError;
}

/**
 * Safely extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}
