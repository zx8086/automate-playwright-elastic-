/* src/core/retry-handler.ts */

/**
 * Generic retry logic abstraction.
 * Eliminates duplicated retry logic from resource verification and download operations.
 */

import type { RetryOptions, RetryResult } from "./types";

/**
 * Execute an operation with retry logic
 *
 * @param operation - The async operation to execute, receives the attempt number (0-indexed)
 * @param shouldRetry - Function that determines if the operation should be retried based on result
 * @param options - Retry configuration options
 * @returns The result of the operation along with the number of retries attempted
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  shouldRetry: (result: T) => boolean,
  options: RetryOptions
): Promise<RetryResult<T>> {
  const {
    maxRetries,
    delayMs,
    backoffMultiplier = 1,
    silent = false,
    operationName = "operation",
  } = options;

  let currentRetry = 0;
  let lastResult: T | undefined;

  while (currentRetry < maxRetries) {
    try {
      if (!silent && currentRetry > 0) {
        console.log(`[RETRY] ${operationName} attempt ${currentRetry + 1}/${maxRetries}`);
      }

      lastResult = await operation(currentRetry);

      if (!shouldRetry(lastResult)) {
        return {
          result: lastResult,
          retriesAttempted: currentRetry,
        };
      }

      currentRetry++;

      if (currentRetry < maxRetries) {
        const delay = delayMs * backoffMultiplier ** currentRetry;
        if (!silent) {
          console.log(`[RETRY] Retrying ${operationName} in ${delay}ms...`);
        }
        await sleep(delay);
      }
    } catch (error) {
      if (!silent) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`[RETRY] ${operationName} exception: ${errorMessage}`);
      }

      currentRetry++;

      if (currentRetry < maxRetries) {
        const delay = delayMs * backoffMultiplier ** currentRetry;
        if (!silent) {
          console.log(`[RETRY] Retrying ${operationName} in ${delay}ms...`);
        }
        await sleep(delay);
      }
    }
  }

  if (!silent) {
    console.log(`[RETRY] All ${maxRetries} attempts failed for ${operationName}`);
  }

  // Return the last result if available, otherwise throw
  if (lastResult !== undefined) {
    return {
      result: lastResult,
      retriesAttempted: currentRetry,
    };
  }

  throw new Error(`All ${maxRetries} ${operationName} attempts failed`);
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @param maxDelayMs - Maximum delay cap in milliseconds
 * @returns Delay in milliseconds
 */
export function calculateBackoff(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number = 30000
): number {
  const delay = baseDelayMs * 2 ** attempt;
  return Math.min(delay, maxDelayMs);
}

/**
 * Create default retry options for resource verification
 */
export function createResourceVerificationRetryOptions(silent: boolean = false): RetryOptions {
  return {
    maxRetries: silent ? 1 : 3,
    delayMs: 2000,
    backoffMultiplier: 1,
    silent,
    operationName: "Resource verification",
  };
}

/**
 * Create default retry options for file downloads
 */
export function createDownloadRetryOptions(): RetryOptions {
  return {
    maxRetries: 3,
    delayMs: 2000,
    backoffMultiplier: 1,
    silent: false,
    operationName: "Download",
  };
}
