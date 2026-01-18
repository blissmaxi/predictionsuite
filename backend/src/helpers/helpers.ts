
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}


/**
 * Retry wrapper for requests (handles rate limiting).
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelayMs = 100
  ): Promise<T> {
    let lastError: Error | null = null;
  
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        const status = error?.response?.status || error?.status;
  
        if (status === 429 && attempt < maxRetries - 1) {
          const waitMs = baseDelayMs * Math.pow(2, attempt);
          console.warn(`Rate limited, waiting ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await sleep(waitMs);
        } else {
          throw error;
        }
      }
    }
  
    throw lastError;
  }