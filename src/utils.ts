/* src/utils.ts */

import { REQUEST_HEADERS, TIMEOUTS } from "./constants";

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

export function cleanText(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type RequestMethod = "GET" | "HEAD";

export interface RequestOptions {
  method: RequestMethod;
  headers: Record<string, string>;
  timeout: number;
}

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

export function createDownloadOptions(
  url: string,
  timeout: number = TIMEOUTS.DOWNLOAD
): RequestOptions {
  return createRequestOptions(url, "GET", timeout);
}

export function createVerificationOptions(
  url: string,
  silent: boolean = false
): RequestOptions {
  const timeout = silent ? TIMEOUTS.RESOURCE_CHECK_SILENT : TIMEOUTS.RESOURCE_CHECK;
  return createRequestOptions(url, "HEAD", timeout);
}

/**
 * Check if a URL is a Bynder transfer URL (external download service)
 */
export function isBynderTransferUrl(url: string): boolean {
  return (
    url.includes("brandportal.tommy.com/transfer") ||
    url.includes("bynder.com/transfer")
  );
}

/**
 * Check if a URL is malformed - where a path is incorrectly concatenated with an external URL
 * e.g., "/some-pathhttps://example.com/resource" instead of "https://example.com/resource"
 */
export function isMalformedExternalUrl(url: string): boolean {
  // Check if URL contains http:// or https:// but doesn't start with it
  const hasEmbeddedHttps = url.includes("https://") && !url.startsWith("https://");
  const hasEmbeddedHttp = url.includes("http://") && !url.startsWith("http://") && !url.startsWith("https://");

  return hasEmbeddedHttps || hasEmbeddedHttp;
}

/**
 * Bynder transfer URLs require special validation since they return HTML pages
 * that render a download interface. We need to check if the page contains
 * valid download data or error messages.
 */
export interface BynderValidationResult {
  isValid: boolean;
  fileName?: string;
  fileSize?: string;
  error?: string;
  isExpired?: boolean;
}

export function parseBynderTransferResponse(html: string): BynderValidationResult {
  // Check for expired/invalid transfer
  if (
    html.includes("expired") ||
    html.includes("invalid") ||
    html.includes("not found") ||
    html.includes("Access Denied") ||
    html.includes("AccessDenied")
  ) {
    return {
      isValid: false,
      error: "Transfer link expired or invalid",
      isExpired: true,
    };
  }

  // Look for valid download data in the Bynder page
  const fileNameMatch = html.match(/firstFilename:\s*"([^"]+)"/);
  const downloadIdMatch = html.match(/downloadId:\s*"([^"]+)"/);
  const downloadHashMatch = html.match(/downloadHash:\s*"([^"]+)"/);

  if (downloadIdMatch && downloadHashMatch) {
    return {
      isValid: true,
      fileName: fileNameMatch ? fileNameMatch[1] : undefined,
    };
  }

  // If we can't find download configuration, treat as potentially broken
  return {
    isValid: false,
    error: "Could not find download configuration in Bynder transfer page",
  };
}
