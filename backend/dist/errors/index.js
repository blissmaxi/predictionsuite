/**
 * Error Types
 *
 * Lightweight typed errors for better debugging and error handling.
 * These extend Error to preserve stack traces while adding context.
 */
/** Base error for all prediction market errors */
export class PredictionMarketError extends Error {
    code;
    context;
    constructor(message, code, context) {
        super(message);
        this.code = code;
        this.context = context;
        this.name = 'PredictionMarketError';
    }
}
/** Error fetching data from an API */
export class ApiError extends PredictionMarketError {
    platform;
    statusCode;
    constructor(message, platform, statusCode, context) {
        super(message, 'API_ERROR', { platform, statusCode, ...context });
        this.platform = platform;
        this.statusCode = statusCode;
        this.name = 'ApiError';
    }
}
/** Error parsing or validating market data */
export class DataValidationError extends PredictionMarketError {
    field;
    constructor(message, field, context) {
        super(message, 'VALIDATION_ERROR', { field, ...context });
        this.field = field;
        this.name = 'DataValidationError';
    }
}
/** Error in matching logic */
export class MatchingError extends PredictionMarketError {
    matchType;
    constructor(message, matchType, context) {
        super(message, 'MATCHING_ERROR', { matchType, ...context });
        this.matchType = matchType;
        this.name = 'MatchingError';
    }
}
/** Error in arbitrage calculation */
export class ArbitrageError extends PredictionMarketError {
    constructor(message, context) {
        super(message, 'ARBITRAGE_ERROR', context);
        this.name = 'ArbitrageError';
    }
}
/**
 * Type guard to check if an error is a PredictionMarketError
 */
export function isPredictionMarketError(error) {
    return error instanceof PredictionMarketError;
}
/**
 * Safely extract error message from unknown error
 */
export function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'Unknown error';
}
