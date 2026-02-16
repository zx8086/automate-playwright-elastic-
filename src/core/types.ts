/* src/core/types.ts */

/**
 * Core types shared across all modules.
 * This module provides type definitions for navigation, validation,
 * HTTP operations, and download functionality.
 */

// ============================================================================
// NAVIGATION TYPES
// ============================================================================

/**
 * Represents a navigation item discovered on a page
 */
export interface NavigationItem {
  text: string;
  href: string;
  fullText: string;
  isDownload: boolean;
}

/**
 * Represents a download link found on a page
 */
export interface DownloadLink {
  text: string;
  href: string;
  fullText: string;
  isDownload: boolean;
  isMalformed?: boolean;
}

// ============================================================================
// IMAGE VALIDATION TYPES
// ============================================================================

/**
 * Information about a valid image
 */
export interface ImageInfo {
  src: string;
  alt: string;
}

/**
 * Information about a broken image
 */
export interface BrokenImageInfo {
  src: string;
  alt: string;
  correctedUrl?: string;
  statusCode?: number;
  error?: string;
}

/**
 * Raw image data from browser evaluation
 */
export interface RawImageData {
  src: string;
  srcset: string;
  alt: string;
  title: string;
  naturalWidth: number;
  naturalHeight: number;
  complete: boolean;
  isBroken: boolean;
  parentText: string;
}

/**
 * Result of image validation on a page
 */
export interface ImageValidationResult {
  validImages: ImageInfo[];
  brokenImages: BrokenImageInfo[];
  downloadableAssets: DownloadLink[];
}

// ============================================================================
// HTTP / RESOURCE CHECK TYPES
// ============================================================================

/**
 * Options for HTTP requests
 */
export interface HttpOptions {
  timeout?: number;
  silent?: boolean;
  maxRetries?: number;
}

/**
 * Result of checking if a resource exists
 */
export interface ResourceCheckResult {
  exists: boolean;
  contentLength?: number;
  statusCode?: number;
  error?: string;
  retriesAttempted?: number;
  externalFileName?: string;
}

/**
 * Result of an external transfer page validation (e.g., Bynder-style pages)
 */
export interface ExternalTransferResult {
  isValid: boolean;
  fileName?: string;
  fileSize?: string;
  error?: string;
  isExpired?: boolean;
}

// ============================================================================
// DOWNLOAD TYPES
// ============================================================================

/**
 * Result of a download operation
 */
export interface DownloadResult {
  success: boolean;
  filePath?: string;
  fileSize?: number;
  error?: string;
}

/**
 * Options for download operations
 */
export interface DownloadOptions {
  maxFileSize?: number;
  timeout?: number;
  maxRetries?: number;
}

// ============================================================================
// RETRY TYPES
// ============================================================================

/**
 * Configuration for retry operations
 */
export interface RetryOptions {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier?: number;
  silent?: boolean;
  operationName?: string;
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  result: T;
  retriesAttempted: number;
}

// ============================================================================
// PAGE ELEMENT TYPES
// ============================================================================

/**
 * Counts of various elements on a page
 */
export interface PageElementCounts {
  images: number;
  paragraphs: number;
  headings: number;
  links: number;
  buttons: number;
}

// ============================================================================
// VIDEO TYPES
// ============================================================================

/**
 * Video element found on a page
 */
export interface VideoElement {
  url: string;
  type: "video" | "embed" | "download";
}

// ============================================================================
// REPORT TYPES
// ============================================================================

/**
 * Summary statistics for a broken links report
 */
export interface ReportSummary {
  totalPages: number;
  pagesWithBrokenLinks: number;
  totalImages: number;
  brokenImages: number;
  totalAssets: number;
  brokenAssets: number;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if an object is a valid NavigationItem
 */
export function isNavigationItem(obj: unknown): obj is NavigationItem {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "text" in obj &&
    "href" in obj &&
    "fullText" in obj &&
    "isDownload" in obj &&
    typeof (obj as NavigationItem).text === "string" &&
    typeof (obj as NavigationItem).href === "string" &&
    typeof (obj as NavigationItem).fullText === "string" &&
    typeof (obj as NavigationItem).isDownload === "boolean"
  );
}

/**
 * Type guard to check if an object is a valid DownloadLink
 */
export function isDownloadLink(obj: unknown): obj is DownloadLink {
  return (
    isNavigationItem(obj) &&
    (typeof (obj as DownloadLink).isMalformed === "undefined" ||
      typeof (obj as DownloadLink).isMalformed === "boolean")
  );
}

/**
 * Type guard to check if an object is a valid VideoElement
 */
export function isVideoElement(obj: unknown): obj is VideoElement {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "url" in obj &&
    "type" in obj &&
    typeof (obj as VideoElement).url === "string" &&
    ["video", "embed", "download"].includes((obj as VideoElement).type)
  );
}
