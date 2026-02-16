/* src/validation/url-validator.ts */

/**
 * URL validation utilities.
 * Provides generic, site-agnostic URL validation functions.
 */

import { DOWNLOAD_KEYWORDS } from "../constants";
import type { ExternalTransferResult } from "../core/types";

// ============================================================================
// MALFORMED URL DETECTION
// ============================================================================

/**
 * Check if a URL is malformed - where a path is incorrectly concatenated with an external URL
 * e.g., "/some-pathhttps://example.com/resource" instead of "https://example.com/resource"
 *
 * This is a generic check that works for any external URL, not just specific services.
 */
export function isMalformedExternalUrl(url: string): boolean {
  // Check if URL contains http:// or https:// but doesn't start with it
  const hasEmbeddedHttps = url.includes("https://") && !url.startsWith("https://");
  const hasEmbeddedHttp =
    url.includes("http://") && !url.startsWith("http://") && !url.startsWith("https://");

  return hasEmbeddedHttps || hasEmbeddedHttp;
}

/**
 * Extract the embedded external URL from a malformed URL
 * e.g., "/some-pathhttps://example.com/resource" -> "https://example.com/resource"
 */
export function extractEmbeddedUrl(malformedUrl: string): string | null {
  // Find the position of https:// or http://
  const httpsIndex = malformedUrl.indexOf("https://");
  const httpIndex = malformedUrl.indexOf("http://");

  // Prefer https over http if both exist
  if (httpsIndex > 0) {
    return malformedUrl.substring(httpsIndex);
  }
  if (httpIndex > 0) {
    return malformedUrl.substring(httpIndex);
  }

  return null;
}

// ============================================================================
// EXTERNAL TRANSFER URL DETECTION
// ============================================================================

/**
 * Check if a URL is an external transfer URL (e.g., Bynder-style download service)
 * These URLs return HTML pages that render a download interface, not direct files.
 *
 * Detection is based on generic patterns:
 * - Contains "/transfer/" in the path
 * - Does not end with just "/transfer/" (must have an ID after)
 */
export function isExternalTransferUrl(url: string): boolean {
  // Generic detection: look for /transfer/ pattern with something after it
  const hasTransferPath = url.includes("/transfer/") && !url.endsWith("/transfer/");

  // Check if the URL matches any known transfer patterns
  // This is generic and will match any service using /transfer/ URLs
  return hasTransferPath;
}

/**
 * Parse an external transfer page HTML to determine if it's valid
 * This looks for common patterns in download service pages:
 * - Download configuration data (downloadId, downloadHash, fileName)
 * - Error messages (expired, invalid, Access Denied)
 */
export function parseExternalTransferPage(html: string): ExternalTransferResult {
  // Check for expired/invalid transfer - generic error detection
  const errorPatterns = [
    "expired",
    "invalid",
    "not found",
    "Access Denied",
    "AccessDenied",
    "Error",
    "error",
    "unavailable",
    "no longer available",
  ];

  const hasError = errorPatterns.some((pattern) =>
    html.toLowerCase().includes(pattern.toLowerCase())
  );

  // Look for valid download data - common patterns in download services
  const fileNamePatterns = [
    /firstFilename:\s*"([^"]+)"/,
    /fileName:\s*"([^"]+)"/,
    /filename:\s*"([^"]+)"/,
    /data-filename="([^"]+)"/,
    /name="([^"]+\.(?:zip|pdf|jpg|png|mp4|mov|rar|7z))"/i,
  ];

  const downloadIdPatterns = [
    /downloadId:\s*"([^"]+)"/,
    /download_id:\s*"([^"]+)"/,
    /data-download-id="([^"]+)"/,
    /id="download-([^"]+)"/,
  ];

  const downloadHashPatterns = [
    /downloadHash:\s*"([^"]+)"/,
    /download_hash:\s*"([^"]+)"/,
    /hash:\s*"([^"]+)"/,
  ];

  let fileName: string | undefined;

  // Try to extract filename
  for (const pattern of fileNamePatterns) {
    const match = html.match(pattern);
    if (match) {
      fileName = match[1];
      break;
    }
  }

  // Check for download configuration
  const hasDownloadId = downloadIdPatterns.some((pattern) => pattern.test(html));
  const hasDownloadHash = downloadHashPatterns.some((pattern) => pattern.test(html));

  // If we have download configuration, it's likely valid
  if (hasDownloadId || hasDownloadHash) {
    // Only report as valid if we don't have clear error indicators
    if (!hasError || (hasDownloadId && hasDownloadHash)) {
      return {
        isValid: true,
        fileName,
      };
    }
  }

  // Check for download button or link as fallback
  const hasDownloadButton =
    html.includes("download-button") ||
    html.includes("downloadButton") ||
    html.includes('class="download"') ||
    html.includes("Download") ||
    html.includes("download-link");

  if (hasDownloadButton && !hasError) {
    return {
      isValid: true,
      fileName,
    };
  }

  // If we only found errors or no valid download configuration
  if (hasError) {
    return {
      isValid: false,
      error: "Transfer link expired or invalid",
      isExpired: true,
    };
  }

  // If we can't find download configuration, treat as potentially broken
  return {
    isValid: false,
    error: "Could not find download configuration in external transfer page",
  };
}

// ============================================================================
// DOWNLOADABLE URL DETECTION
// ============================================================================

/**
 * Check if a URL is likely a downloadable resource based on its path and extension
 */
export function isDownloadableUrl(url: string): boolean {
  const urlLower = url.toLowerCase();

  // Check against download keywords from constants
  const hasDownloadKeyword = DOWNLOAD_KEYWORDS.some((keyword) =>
    urlLower.includes(keyword.toLowerCase())
  );

  if (hasDownloadKeyword) {
    return true;
  }

  // Check for common downloadable file extensions
  const downloadableExtensions = [
    ".pdf",
    ".zip",
    ".rar",
    ".7z",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".mp4",
    ".mov",
    ".avi",
    ".mp3",
    ".wav",
  ];

  const hasDownloadableExtension = downloadableExtensions.some((ext) => urlLower.endsWith(ext));

  return hasDownloadableExtension;
}

/**
 * Check if a URL points to an assets directory (not a downloadable file)
 */
export function isAssetsDirectory(url: string): boolean {
  const urlLower = url.toLowerCase();

  // Check if it ends with /assets/ or /assets (without a file extension after)
  const isAssetsPath = urlLower.endsWith("/assets/") || urlLower.endsWith("/assets");

  // Make sure it doesn't have a file extension
  const hasFileExtension = /\.[a-z0-9]{2,5}$/i.test(url);

  return isAssetsPath && !hasFileExtension;
}

// ============================================================================
// URL VALIDATION
// ============================================================================

/**
 * Check if a URL is valid and should be processed
 */
export function isValidUrl(url: string): boolean {
  if (!url) return false;

  // Skip empty, hash-only, and special URLs
  if (
    url === "#" ||
    url.startsWith("javascript:") ||
    url.startsWith("mailto:") ||
    url.startsWith("tel:")
  ) {
    return false;
  }

  return true;
}

/**
 * Normalize a URL for comparison (removes trailing slashes, etc.)
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove trailing slash from pathname
    if (parsed.pathname.endsWith("/") && parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    // If URL parsing fails, return as-is
    return url;
  }
}
