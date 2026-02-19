/* src/download/transfer-handler.ts */

/**
 * Transfer page handler module.
 * Handles browser-based downloads for external transfer URLs (e.g., Bynder, WeTransfer, etc.)
 * These URLs return HTML pages that require JavaScript execution to initiate the actual download.
 *
 * This module is site-agnostic and works with any transfer service that:
 * - Uses /transfer/ URL pattern
 * - Provides download buttons/links on the page
 * - May require user interaction to start downloads
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Page } from "@playwright/test";
import { TIMEOUTS } from "../constants";
import type { ExternalTransferResult } from "../core/types";
import { parseExternalTransferPage } from "../validation/url-validator";

// ============================================================================
// TYPES
// ============================================================================

export interface TransferDownloadResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  error?: string;
  method: "browser" | "direct" | "failed";
}

export interface TransferPageInfo {
  isValid: boolean;
  fileName?: string;
  fileSize?: string;
  downloadUrl?: string;
  error?: string;
  isExpired?: boolean;
}

// ============================================================================
// TRANSFER PAGE DETECTION
// ============================================================================

/**
 * Common selectors for download buttons/links on transfer pages
 * These are generic patterns that work across different transfer services
 */
const TRANSFER_DOWNLOAD_SELECTORS = [
  // Button-based selectors
  'button[class*="download"]',
  'button[id*="download"]',
  'a[class*="download"]',
  'a[id*="download"]',
  ".download-button",
  ".download-btn",
  "#download-button",
  "#downloadButton",

  // Text-based selectors
  'button:has-text("Download")',
  'a:has-text("Download")',
  'button:has-text("download")',
  'a:has-text("download")',

  // Data attribute selectors
  "[data-action='download']",
  "[data-download]",
  "[data-file-download]",

  // Role-based selectors
  'a[role="button"][href*="download"]',

  // Generic link patterns
  'a[href*=".zip"]',
  'a[href*=".pdf"]',
  'a[href*="download"]',
] as const;

// ============================================================================
// TRANSFER PAGE ANALYSIS
// ============================================================================

/**
 * Analyze a transfer page to extract download information
 * This uses page.evaluate to run in browser context for better JavaScript parsing
 */
export async function analyzeTransferPage(page: Page): Promise<TransferPageInfo> {
  try {
    // Get the page content
    const html = await page.content();

    // First try the static HTML parser
    const staticResult = parseExternalTransferPage(html);

    if (staticResult.isValid && staticResult.fileName) {
      // Try to extract actual download URL from the page
      const downloadUrl = await extractDownloadUrl(page);

      return {
        isValid: true,
        fileName: staticResult.fileName,
        fileSize: staticResult.fileSize,
        downloadUrl,
      };
    }

    // If static parsing failed, try browser-based extraction
    const browserResult = await page.evaluate(() => {
      // Look for download configuration in window or data attributes
      const patterns = {
        fileName: [
          // JavaScript variables
          () => (window as any).firstFilename,
          () => (window as any).fileName,
          () => (window as any).downloadConfig?.fileName,
          // Data attributes
          () => document.querySelector("[data-filename]")?.getAttribute("data-filename"),
          () => document.querySelector("[data-file-name]")?.getAttribute("data-file-name"),
          // Meta tags
          () =>
            document.querySelector('meta[property="og:title"]')?.getAttribute("content"),
          // Title parsing
          () => {
            const title = document.title;
            const match = title.match(/Download\s+(.+)/i);
            return match ? match[1] : null;
          },
        ],
        downloadUrl: [
          // Direct download links
          () =>
            (document.querySelector('a[download]') as HTMLAnchorElement)?.href,
          () =>
            (document.querySelector('a[href*="download"]') as HTMLAnchorElement)?.href,
          () =>
            (document.querySelector('a[href*=".zip"]') as HTMLAnchorElement)?.href,
          () =>
            (document.querySelector('a[href*=".pdf"]') as HTMLAnchorElement)?.href,
          // JavaScript variables
          () => (window as any).downloadUrl,
          () => (window as any).downloadConfig?.url,
          () => (window as any).fileUrl,
        ],
      };

      let fileName: string | undefined;
      let downloadUrl: string | undefined;

      // Try each pattern for fileName
      for (const pattern of patterns.fileName) {
        try {
          const result = pattern();
          if (result && typeof result === "string") {
            fileName = result;
            break;
          }
        } catch {
          // Pattern failed, try next
        }
      }

      // Try each pattern for downloadUrl
      for (const pattern of patterns.downloadUrl) {
        try {
          const result = pattern();
          if (result && typeof result === "string" && result.startsWith("http")) {
            downloadUrl = result;
            break;
          }
        } catch {
          // Pattern failed, try next
        }
      }

      // Check for error indicators
      const errorIndicators = [
        "expired",
        "invalid",
        "not found",
        "unavailable",
        "error",
        "access denied",
      ];

      const pageText = document.body.innerText.toLowerCase();
      const hasError = errorIndicators.some((indicator) => pageText.includes(indicator));

      // Check for download button presence
      const downloadSelectors = [
        'button[class*="download"]',
        'a[class*="download"]',
        ".download-button",
        "#download-button",
      ];

      const hasDownloadButton = downloadSelectors.some((selector) =>
        document.querySelector(selector)
      );

      return {
        fileName,
        downloadUrl,
        hasError,
        hasDownloadButton,
      };
    });

    if (browserResult.hasError && !browserResult.hasDownloadButton) {
      return {
        isValid: false,
        error: "Transfer link expired or invalid",
        isExpired: true,
      };
    }

    if (browserResult.fileName || browserResult.downloadUrl || browserResult.hasDownloadButton) {
      return {
        isValid: true,
        fileName: browserResult.fileName,
        downloadUrl: browserResult.downloadUrl,
      };
    }

    return {
      isValid: false,
      error: "Could not find download configuration on transfer page",
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Failed to analyze transfer page: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Extract the actual download URL from a transfer page
 */
async function extractDownloadUrl(page: Page): Promise<string | undefined> {
  try {
    return await page.evaluate(() => {
      // Check for direct download links
      const downloadLink = document.querySelector(
        'a[download], a[href*="download"], a[href*=".zip"], a[href*=".pdf"]'
      ) as HTMLAnchorElement | null;

      if (downloadLink?.href) {
        return downloadLink.href;
      }

      // Check for JavaScript-based download URL
      const win = window as any;
      if (win.downloadUrl) return win.downloadUrl;
      if (win.downloadConfig?.url) return win.downloadConfig.url;
      if (win.fileUrl) return win.fileUrl;

      return undefined;
    });
  } catch {
    return undefined;
  }
}

// ============================================================================
// BROWSER-BASED DOWNLOAD
// ============================================================================

/**
 * Download a file from a transfer page using the browser
 * This handles pages that require JavaScript execution or button clicks
 */
export async function downloadFromTransferPage(
  page: Page,
  transferUrl: string,
  destinationDir: string,
  silent: boolean = false
): Promise<TransferDownloadResult> {
  if (!silent) {
    console.log(`[TRANSFER] Starting browser-based download for: ${transferUrl}`);
  }

  try {
    // Navigate to the transfer page
    await page.goto(transferUrl, {
      waitUntil: "networkidle",
      timeout: TIMEOUTS.PAGE_LOAD,
    });

    // Analyze the page
    const pageInfo = await analyzeTransferPage(page);

    if (!pageInfo.isValid) {
      return {
        success: false,
        error: pageInfo.error || "Invalid transfer page",
        method: "failed",
      };
    }

    if (!silent) {
      console.log(`[TRANSFER] Page analysis result:`);
      if (pageInfo.fileName) console.log(`   File: ${pageInfo.fileName}`);
      if (pageInfo.downloadUrl) console.log(`   Direct URL found: ${pageInfo.downloadUrl}`);
    }

    // If we have a direct download URL, use it
    if (pageInfo.downloadUrl) {
      return await downloadDirectUrl(page, pageInfo.downloadUrl, destinationDir, pageInfo.fileName, silent);
    }

    // Otherwise, try to click the download button
    return await clickDownloadButton(page, destinationDir, pageInfo.fileName, silent);
  } catch (error) {
    return {
      success: false,
      error: `Browser download failed: ${error instanceof Error ? error.message : String(error)}`,
      method: "failed",
    };
  }
}

/**
 * Download from a direct URL discovered on the transfer page
 */
async function downloadDirectUrl(
  page: Page,
  url: string,
  destinationDir: string,
  suggestedFileName: string | undefined,
  silent: boolean
): Promise<TransferDownloadResult> {
  if (!silent) {
    console.log(`[TRANSFER] Downloading from direct URL: ${url}`);
  }

  try {
    // Set up download listener
    const downloadPromise = page.waitForEvent("download", { timeout: TIMEOUTS.DOWNLOAD });

    // Navigate to or click the download link
    await page.evaluate((downloadUrl) => {
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }, url);

    // Wait for download
    const download = await downloadPromise;

    // Get the suggested filename from the download
    const fileName = download.suggestedFilename() || suggestedFileName || path.basename(url);
    const filePath = path.join(destinationDir, fileName);

    // Save the file
    await download.saveAs(filePath);

    // Get file size
    const stats = fs.statSync(filePath);

    if (!silent) {
      console.log(`[TRANSFER] Successfully downloaded: ${fileName} (${formatFileSize(stats.size)})`);
    }

    return {
      success: true,
      filePath,
      fileName,
      fileSize: stats.size,
      method: "browser",
    };
  } catch (error) {
    return {
      success: false,
      error: `Direct URL download failed: ${error instanceof Error ? error.message : String(error)}`,
      method: "failed",
    };
  }
}

/**
 * Click the download button on a transfer page
 */
async function clickDownloadButton(
  page: Page,
  destinationDir: string,
  suggestedFileName: string | undefined,
  silent: boolean
): Promise<TransferDownloadResult> {
  if (!silent) {
    console.log(`[TRANSFER] Looking for download button...`);
  }

  try {
    // Set up download listener before clicking
    const downloadPromise = page.waitForEvent("download", { timeout: TIMEOUTS.DOWNLOAD });

    // Try each selector
    let clicked = false;
    for (const selector of TRANSFER_DOWNLOAD_SELECTORS) {
      try {
        const element = await page.$(selector);
        if (element) {
          if (!silent) {
            console.log(`[TRANSFER] Found download element: ${selector}`);
          }
          await element.click();
          clicked = true;
          break;
        }
      } catch {
        // Selector not found, try next
      }
    }

    if (!clicked) {
      // Try a more aggressive approach - find any element with "download" text
      const downloadElement = await page.getByRole("button", { name: /download/i }).or(
        page.getByRole("link", { name: /download/i })
      );

      if (await downloadElement.count() > 0) {
        await downloadElement.first().click();
        clicked = true;
      }
    }

    if (!clicked) {
      return {
        success: false,
        error: "Could not find download button on transfer page",
        method: "failed",
      };
    }

    // Wait for download
    const download = await downloadPromise;

    // Get filename and save
    const fileName = download.suggestedFilename() || suggestedFileName || "download";
    const filePath = path.join(destinationDir, fileName);

    await download.saveAs(filePath);

    const stats = fs.statSync(filePath);

    if (!silent) {
      console.log(`[TRANSFER] Successfully downloaded: ${fileName} (${formatFileSize(stats.size)})`);
    }

    return {
      success: true,
      filePath,
      fileName,
      fileSize: stats.size,
      method: "browser",
    };
  } catch (error) {
    return {
      success: false,
      error: `Button click download failed: ${error instanceof Error ? error.message : String(error)}`,
      method: "failed",
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * Check if a URL is an external transfer URL
 * Exported for use in other modules
 */
export function isTransferUrl(url: string): boolean {
  // Generic detection: look for /transfer/ pattern with something after it
  return url.includes("/transfer/") && !url.endsWith("/transfer/");
}
