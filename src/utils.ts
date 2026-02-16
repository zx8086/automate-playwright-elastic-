/* src/utils.ts */

/**
 * Utility functions for the press kit automation tool.
 * Provides generic helper functions that are site-agnostic.
 */

import { REQUEST_HEADERS, TIMEOUTS } from "./constants";

// ============================================================================
// TEXT FORMATTING
// ============================================================================

/**
 * Format a file size in bytes to a human-readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * Clean HTML text by removing line breaks and normalizing whitespace
 */
export function cleanText(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================================
// HTTP REQUEST OPTIONS
// ============================================================================

export type RequestMethod = "GET" | "HEAD";

export interface RequestOptions {
  method: RequestMethod;
  headers: Record<string, string>;
  timeout: number;
}

/**
 * Create HTTP request options with proper headers
 */
export function createRequestOptions(
  url: string,
  method: RequestMethod = "HEAD",
  timeout: number = TIMEOUTS.RESOURCE_CHECK
): RequestOptions {
  return {
    method,
    headers: {
      ...REQUEST_HEADERS,
      Referer: new URL(url).origin,
    },
    timeout,
  };
}

/**
 * Create download request options (GET with appropriate timeout)
 */
export function createDownloadOptions(
  url: string,
  timeout: number = TIMEOUTS.DOWNLOAD
): RequestOptions {
  return createRequestOptions(url, "GET", timeout);
}

/**
 * Create verification request options (HEAD with appropriate timeout)
 */
export function createVerificationOptions(url: string, silent: boolean = false): RequestOptions {
  const timeout = silent ? TIMEOUTS.RESOURCE_CHECK_SILENT : TIMEOUTS.RESOURCE_CHECK;
  return createRequestOptions(url, "HEAD", timeout);
}

// ============================================================================
// URL UTILITIES (Re-exports for backwards compatibility)
// ============================================================================

// Re-export the result type for backwards compatibility
export type { ExternalTransferResult as BynderValidationResult } from "./core/types";
// Re-export from url-validator for backwards compatibility
// Backwards compatibility alias
export {
  isDownloadableUrl,
  isExternalTransferUrl,
  isExternalTransferUrl as isBynderTransferUrl,
  isMalformedExternalUrl,
  isValidUrl,
  normalizeUrl,
  parseExternalTransferPage,
  parseExternalTransferPage as parseBynderTransferResponse,
} from "./validation/url-validator";
