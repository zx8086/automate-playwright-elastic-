/* src/validation/url-validator.ts */

/**
 * URL validation utilities.
 * Provides generic, site-agnostic URL validation functions.
 *
 * This module is designed to work with ANY website, not just specific services.
 * All detection is based on generic patterns rather than hardcoded domains.
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
 * Check if a URL is an external transfer URL (e.g., Bynder, WeTransfer, Dropbox, etc.)
 * These URLs return HTML pages that render a download interface, not direct files.
 *
 * Detection is based on generic patterns that work with ANY transfer service:
 * - Contains "/transfer/" in the path (common pattern: /transfer/{id})
 * - Contains "/share/" with a long hash/ID (common for sharing services)
 * - Contains "/dl/" or "/download/" with a hash/ID
 *
 * This function is site-agnostic and does NOT check for specific domains.
 */
export function isExternalTransferUrl(url: string): boolean {
  // Generic transfer path patterns
  const transferPatterns = [
    // /transfer/{id} - Bynder, custom services
    /\/transfer\/[a-f0-9]{16,}/i,
    // /share/{id} - WeTransfer, Google Drive, etc.
    /\/share\/[a-zA-Z0-9_-]{8,}/i,
    // /dl/{id} - Dropbox, OneDrive
    /\/dl\/[a-zA-Z0-9_-]{8,}/i,
    // /d/{id} - Google Drive pattern
    /\/d\/[a-zA-Z0-9_-]{20,}/i,
  ];

  // Check if URL matches any transfer pattern
  const matchesPattern = transferPatterns.some((pattern) => pattern.test(url));

  // Additional check: /transfer/ with something after it (less strict)
  const hasTransferPath = url.includes("/transfer/") && !url.endsWith("/transfer/");

  return matchesPattern || hasTransferPath;
}

/**
 * Parse an external transfer page HTML to determine if it's valid
 * This looks for common patterns in download service pages:
 * - Download configuration data (downloadId, downloadHash, fileName)
 * - Error messages (expired, invalid, Access Denied)
 *
 * This function is site-agnostic and works with various transfer services:
 * - Bynder Brand Portal
 * - WeTransfer
 * - Dropbox
 * - Google Drive
 * - Custom enterprise transfer services
 */
export function parseExternalTransferPage(html: string): ExternalTransferResult {
  const htmlLower = html.toLowerCase();

  // Check for expired/invalid transfer - generic error detection
  // These patterns are common across all transfer services
  const errorPatterns = [
    "expired",
    "invalid",
    "not found",
    "access denied",
    "accessdenied",
    "unavailable",
    "no longer available",
    "does not exist",
    "has been removed",
    "link has expired",
    "transfer expired",
    "file not found",
    "404",
    "forbidden",
  ];

  // Only consider it an error if these patterns appear prominently
  // (not just in error handling code)
  const hasError = errorPatterns.some((pattern) => {
    const index = htmlLower.indexOf(pattern);
    if (index === -1) return false;

    // Check if this is in main content (not in script/style blocks)
    const beforeText = htmlLower.substring(Math.max(0, index - 100), index);
    const isInScript = beforeText.includes("<script") && !beforeText.includes("</script");
    const isInStyle = beforeText.includes("<style") && !beforeText.includes("</style");

    return !isInScript && !isInStyle;
  });

  // Look for valid download data - common patterns across transfer services
  const fileNamePatterns = [
    // JavaScript variable patterns
    /firstFilename:\s*["']([^"']+)["']/,
    /fileName:\s*["']([^"']+)["']/,
    /filename:\s*["']([^"']+)["']/,
    /file_name:\s*["']([^"']+)["']/,
    /"fileName":\s*["']([^"']+)["']/,
    /"filename":\s*["']([^"']+)["']/,

    // HTML data attributes
    /data-filename=["']([^"']+)["']/,
    /data-file-name=["']([^"']+)["']/,
    /data-name=["']([^"']+)["']/,

    // Download link patterns
    /download=["']([^"']+)["']/,
    /title=["']([^"']+\.(?:zip|pdf|jpg|jpeg|png|mp4|mov|rar|7z|doc|docx|xls|xlsx))["']/i,

    // Meta tag patterns
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<title>([^<]+)<\/title>/i,

    // JSON patterns
    /"name":\s*["']([^"']+\.(?:zip|pdf|jpg|png|mp4|mov|rar|7z))["']/i,
  ];

  const downloadIdPatterns = [
    /downloadId:\s*["']([^"']+)["']/,
    /download_id:\s*["']([^"']+)["']/,
    /"downloadId":\s*["']([^"']+)["']/,
    /data-download-id=["']([^"']+)["']/,
    /data-id=["']([a-f0-9]{16,})["']/i,
    /id=["']download-([^"']+)["']/,
  ];

  const downloadHashPatterns = [
    /downloadHash:\s*["']([^"']+)["']/,
    /download_hash:\s*["']([^"']+)["']/,
    /"downloadHash":\s*["']([^"']+)["']/,
    /hash:\s*["']([a-f0-9]{32,})["']/i,
    /token:\s*["']([a-zA-Z0-9_-]{20,})["']/,
  ];

  let fileName: string | undefined;
  let fileSize: string | undefined;

  // Try to extract filename
  for (const pattern of fileNamePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      // Clean up the filename
      const candidate = match[1].trim();
      // Skip if it looks like a path or URL
      if (!candidate.includes("/") && !candidate.startsWith("http")) {
        fileName = candidate;
        break;
      }
    }
  }

  // Try to extract file size
  const fileSizePatterns = [
    /fileSize:\s*["']([^"']+)["']/,
    /size:\s*["'](\d+(?:\.\d+)?\s*(?:KB|MB|GB|bytes))["']/i,
    /"fileSize":\s*["']([^"']+)["']/,
    /data-size=["']([^"']+)["']/,
  ];

  for (const pattern of fileSizePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      fileSize = match[1];
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
        fileSize,
      };
    }
  }

  // Check for download button or link as fallback
  const downloadButtonPatterns = [
    "download-button",
    "downloadbutton",
    'class="download"',
    "download-link",
    "download-btn",
    "btn-download",
    'role="download"',
    ">download<",
    ">download now<",
    ">get file<",
    ">download file<",
  ];

  const hasDownloadButton = downloadButtonPatterns.some((pattern) =>
    htmlLower.includes(pattern)
  );

  if (hasDownloadButton && !hasError) {
    return {
      isValid: true,
      fileName,
      fileSize,
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
