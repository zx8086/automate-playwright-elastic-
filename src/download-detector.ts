/* src/download-detector.ts */

/**
 * Download detection module.
 * Determines if URLs point to downloadable resources.
 */

import * as path from "node:path";
import { DOWNLOAD_KEYWORDS, DOWNLOADABLE_EXTENSIONS } from "./constants";
import { isAssetsDirectory, isExternalTransferUrl } from "./validation/url-validator";

// ============================================================================
// DOWNLOAD DETECTOR CLASS
// ============================================================================

export class DownloadDetector {
  /**
   * Check if a URL points to a downloadable resource
   */
  static isDownloadableResource(url: string): boolean {
    const extension = path.extname(url).toLowerCase();
    const urlLower = url.toLowerCase();

    // Check if this is an assets directory (page, not download)
    if (isAssetsDirectory(url)) {
      console.log(`Checking URL: ${url}`);
      console.log(`   Extension: ${extension}`);
      console.log(`   Assets page detected - treating as regular page, not download`);
      console.log(`   Final result: NOT DOWNLOADABLE`);
      return false;
    }

    // Check for downloadable file extension
    const hasDownloadExtension = DOWNLOADABLE_EXTENSIONS.includes(
      extension as (typeof DOWNLOADABLE_EXTENSIONS)[number]
    );

    // Check for download keywords in URL
    const hasDownloadKeyword = DOWNLOAD_KEYWORDS.some((keyword) =>
      urlLower.includes(keyword.toLowerCase())
    );

    // Check for external transfer URL
    const isTransferUrl = isExternalTransferUrl(url);

    // Check for assets with file extension
    const isAssetWithExtension = urlLower.includes("assets") && extension.length > 0;

    // Combine all checks
    const isDownloadable =
      hasDownloadExtension || hasDownloadKeyword || isTransferUrl || isAssetWithExtension;

    console.log(`Checking URL: ${url}`);
    console.log(`   Extension: ${extension}`);
    console.log(`   Has download extension: ${hasDownloadExtension}`);
    console.log(`   Has download keyword: ${hasDownloadKeyword}`);
    console.log(`   Is transfer URL: ${isTransferUrl}`);
    console.log(`   Final result: ${isDownloadable ? "DOWNLOADABLE" : "NOT DOWNLOADABLE"}`);

    return isDownloadable;
  }

  /**
   * Get the file extension from a URL
   */
  static getFileExtension(url: string): string {
    return path.extname(url).toLowerCase();
  }

  /**
   * Check if a URL is valid for downloading
   */
  static isValidDownloadUrl(url: string): boolean {
    if (
      !url ||
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
   * Get the filename from a URL
   */
  static getFilename(url: string): string {
    try {
      const urlObj = new URL(url);
      return path.basename(urlObj.pathname);
    } catch {
      return path.basename(url);
    }
  }
}
