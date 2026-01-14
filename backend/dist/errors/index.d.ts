/**
 * Error Types
 *
 * Lightweight typed errors for better debugging and error handling.
 * These extend Error to preserve stack traces while adding context.
 */
/** Base error for all prediction market errors */
export declare class PredictionMarketError extends Error {
    readonly code: string;
    readonly context?: Record<string, unknown> | undefined;
    constructor(message: string, code: string, context?: Record<string, unknown> | undefined);
}
/** Error fetching data from an API */
export declare class ApiError extends PredictionMarketError {
    readonly platform: 'polymarket' | 'kalshi';
    readonly statusCode?: number | undefined;
    constructor(message: string, platform: 'polymarket' | 'kalshi', statusCode?: number | undefined, context?: Record<string, unknown>);
}
/** Error parsing or validating market data */
export declare class DataValidationError extends PredictionMarketError {
    readonly field: string;
    constructor(message: string, field: string, context?: Record<string, unknown>);
}
/** Error in matching logic */
export declare class MatchingError extends PredictionMarketError {
    readonly matchType: 'event' | 'market';
    constructor(message: string, matchType: 'event' | 'market', context?: Record<string, unknown>);
}
/** Error in arbitrage calculation */
export declare class ArbitrageError extends PredictionMarketError {
    constructor(message: string, context?: Record<string, unknown>);
}
/**
 * Type guard to check if an error is a PredictionMarketError
 */
export declare function isPredictionMarketError(error: unknown): error is PredictionMarketError;
/**
 * Safely extract error message from unknown error
 */
export declare function getErrorMessage(error: unknown): string;
