/* src/download/download-manager.ts */

/**
 * Download orchestration module.
 * Manages download operations with validation, size checks, and error handling.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "../../config";
import { getHttpClient, type HttpClient } from "../core/http-client";
import type { DownloadResult, ResourceCheckResult } from "../core/types";
import { DownloadDetector } from "../download-detector";
import { formatFileSize } from "../utils";

// ============================================================================
// DOWNLOAD MANAGER CLASS
// ============================================================================

export class DownloadManager {
  private httpClient: HttpClient;
  private downloadDetector: typeof DownloadDetector;

  constructor(httpClient?: HttpClient, downloadDetector?: typeof DownloadDetector) {
    this.httpClient = httpClient ?? getHttpClient();
    this.downloadDetector = downloadDetector ?? DownloadDetector;
  }

  /**
   * Process a download request with full validation
   */
  async processDownload(
    url: string,
    label: string,
    _sourceUrl: string
  ): Promise<{
    success: boolean;
    result?: DownloadResult;
    verification?: ResourceCheckResult;
    skipped?: { reason: string };
  }> {
    console.log(`[DOWNLOAD] Processing download: ${label} from ${url}`);

    // Verify the resource exists first
    const verification = await this.httpClient.verifyResource(url);

    if (!verification.exists) {
      console.log(`[BROKEN] Resource not accessible: ${url}`);
      return {
        success: false,
        verification,
      };
    }

    console.log(`Resource ${label} exists and is accessible`);

    // Check file size limits
    const skipCheck = this.shouldSkipDownload(url, verification.contentLength);
    if (skipCheck.skip) {
      console.log(`[SKIP] ${skipCheck.reason}`);
      return {
        success: false,
        verification,
        skipped: { reason: skipCheck.reason || "Download skipped" },
      };
    }

    // Perform the download
    const downloadPath = this.getDownloadPath(url);
    const result = await this.httpClient.downloadFile(url, downloadPath, {
      maxFileSize: config.allowedDownloads.maxFileSize,
    });

    if (result.success) {
      console.log(`Successfully downloaded: ${downloadPath}`);
      if (result.fileSize) {
        console.log(`File size: ${formatFileSize(result.fileSize)}`);
      }
    } else {
      console.log(`Download failed for: ${url}`);
    }

    return {
      success: result.success,
      result,
      verification,
    };
  }

  /**
   * Check if a download should be skipped
   */
  shouldSkipDownload(url: string, contentLength?: number): { skip: boolean; reason?: string } {
    // Check file size
    if (contentLength && contentLength > config.allowedDownloads.maxFileSize) {
      return {
        skip: true,
        reason: `File size ${formatFileSize(contentLength)} exceeds maximum allowed size of ${formatFileSize(config.allowedDownloads.maxFileSize)}`,
      };
    }

    // Check if URL is valid
    if (!this.downloadDetector.isValidDownloadUrl(url)) {
      return {
        skip: true,
        reason: "Invalid download URL",
      };
    }

    return { skip: false };
  }

  /**
   * Get the download path for a URL
   */
  getDownloadPath(url: string): string {
    const filename = this.downloadDetector.getFilename(url);
    return path.join(config.server.downloadsDir, filename);
  }

  /**
   * Check if a file has already been downloaded
   */
  isAlreadyDownloaded(url: string): boolean {
    const downloadPath = this.getDownloadPath(url);
    return fs.existsSync(downloadPath);
  }

  /**
   * Get file size of a downloaded file
   */
  getDownloadedFileSize(url: string): number | undefined {
    const downloadPath = this.getDownloadPath(url);
    if (fs.existsSync(downloadPath)) {
      return fs.statSync(downloadPath).size;
    }
    return undefined;
  }

  /**
   * Clean up a failed download
   */
  cleanupFailedDownload(url: string): void {
    const downloadPath = this.getDownloadPath(url);
    if (fs.existsSync(downloadPath)) {
      fs.unlinkSync(downloadPath);
      console.log(`Cleaned up failed download: ${downloadPath}`);
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let downloadManagerInstance: DownloadManager | null = null;

/**
 * Get the shared DownloadManager instance
 */
export function getDownloadManager(): DownloadManager {
  if (!downloadManagerInstance) {
    downloadManagerInstance = new DownloadManager();
  }
  return downloadManagerInstance;
}
