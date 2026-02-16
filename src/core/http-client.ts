/* src/core/http-client.ts */

/**
 * Centralized HTTP operations with retry logic.
 * Handles resource verification, external transfer URLs, and file downloads.
 */

import * as fs from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import { REQUEST_HEADERS, RETRY_CONFIG, TIMEOUTS } from "../constants";
import { formatFileSize } from "../utils";
import { isExternalTransferUrl, parseExternalTransferPage } from "../validation/url-validator";
import { withRetry } from "./retry-handler";
import type { DownloadResult, HttpOptions, ResourceCheckResult } from "./types";

// ============================================================================
// HTTP CLIENT CLASS
// ============================================================================

export class HttpClient {
  private defaultTimeout: number;
  private defaultMaxRetries: number;

  constructor(options?: { timeout?: number; maxRetries?: number }) {
    this.defaultTimeout = options?.timeout ?? TIMEOUTS.RESOURCE_CHECK;
    this.defaultMaxRetries = options?.maxRetries ?? RETRY_CONFIG.RESOURCE_VERIFICATION;
  }

  /**
   * Verify that a resource exists and is accessible
   */
  async verifyResource(url: string, options?: HttpOptions): Promise<ResourceCheckResult> {
    const silent = options?.silent ?? false;
    const maxRetries =
      options?.maxRetries ??
      (silent ? RETRY_CONFIG.RESOURCE_VERIFICATION_SILENT : this.defaultMaxRetries);
    const timeout =
      options?.timeout ?? (silent ? TIMEOUTS.RESOURCE_CHECK_SILENT : this.defaultTimeout);

    // Check for external transfer URLs (e.g., Bynder-style)
    if (isExternalTransferUrl(url)) {
      return this.verifyExternalTransferUrl(url, { ...options, timeout });
    }

    let lastStatusCode: number | undefined;
    let lastError: string | undefined;

    const result = await withRetry(
      async (attempt) => {
        if (!silent) {
          console.log(
            `[VERIFY] Resource verification attempt ${attempt + 1}/${maxRetries}: ${url}`
          );
        }

        return new Promise<ResourceCheckResult>((resolve) => {
          const protocol = url.startsWith("https") ? https : http;
          const requestOptions = this.createRequestOptions(url, "HEAD", timeout);

          const req = protocol.request(url, requestOptions, (res) => {
            const statusCode = res.statusCode || 0;
            const contentType = res.headers["content-type"] || "";
            const contentLength = Number.parseInt(res.headers["content-length"] || "0", 10);

            if (!silent) {
              console.log(`[VERIFY] Resource check response:`);
              console.log(`   Status: ${statusCode}`);
              console.log(`   Content-Type: ${contentType}`);
              console.log(`   Content-Length: ${formatFileSize(contentLength)}`);
            }

            // Some servers return 405 for HEAD requests - treat as success if it's an image
            const isSuccess =
              (statusCode >= 200 && statusCode < 400) ||
              (statusCode === 405 && url.match(/\.(jpg|jpeg|png|gif|webp|tiff|bmp)$/i) !== null);

            req.destroy();

            if (!silent) {
              console.log(`   Result: ${isSuccess ? "EXISTS" : "NOT FOUND"}`);
            }

            lastStatusCode = statusCode;
            resolve({ exists: isSuccess, contentLength, statusCode });
          });

          req.on("error", (error) => {
            if (!silent) {
              console.log(`Resource verification error: ${error.message}`);
            }
            lastError = error.message;
            resolve({ exists: false, error: error.message });
          });

          req.on("timeout", () => {
            req.destroy();
            if (!silent) {
              console.log(`[TIMEOUT] Resource verification timeout`);
            }
            lastError = "Request timeout";
            resolve({ exists: false, error: "Request timeout" });
          });

          req.end();
        });
      },
      (result) => !result.exists,
      {
        maxRetries,
        delayMs: 2000,
        silent,
        operationName: "Resource verification",
      }
    );

    return {
      ...result.result,
      retriesAttempted: result.retriesAttempted,
      statusCode: result.result.statusCode ?? lastStatusCode,
      error: result.result.error ?? lastError,
    };
  }

  /**
   * Verify an external transfer URL (e.g., Bynder-style transfer pages)
   * These URLs return HTML pages with download configuration, not direct files
   */
  async verifyExternalTransferUrl(
    url: string,
    options?: HttpOptions
  ): Promise<ResourceCheckResult> {
    const silent = options?.silent ?? false;
    const timeout = options?.timeout ?? this.defaultTimeout;

    if (!silent) {
      console.log(`[EXTERNAL] Verifying external transfer URL: ${url}`);
    }

    return new Promise((resolve) => {
      const protocol = url.startsWith("https") ? https : http;
      let responseData = "";

      const requestOptions = {
        method: "GET" as const,
        headers: {
          "User-Agent": REQUEST_HEADERS["User-Agent"],
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout,
      };

      const req = protocol.request(url, requestOptions, (res) => {
        const statusCode = res.statusCode || 0;

        if (!silent) {
          console.log(`[EXTERNAL] Response status: ${statusCode}`);
        }

        // Collect response body to analyze
        res.on("data", (chunk) => {
          responseData += chunk.toString();
          // Limit response size to prevent memory issues
          if (responseData.length > 100000) {
            req.destroy();
          }
        });

        res.on("end", () => {
          // Check for Access Denied XML response
          if (
            responseData.includes("<Code>AccessDenied</Code>") ||
            responseData.includes("<Message>Access Denied</Message>")
          ) {
            if (!silent) {
              console.log(`[EXTERNAL] Access Denied - transfer link may be expired or restricted`);
            }
            resolve({
              exists: false,
              statusCode,
              error: "Access Denied - external transfer link expired or restricted",
              retriesAttempted: 0,
            });
            return;
          }

          // Parse the external transfer page
          const validation = parseExternalTransferPage(responseData);

          if (validation.isValid) {
            if (!silent) {
              console.log(`[EXTERNAL] Valid transfer link found`);
              if (validation.fileName) {
                console.log(`[EXTERNAL] File: ${validation.fileName}`);
              }
            }
            resolve({
              exists: true,
              statusCode,
              externalFileName: validation.fileName,
              retriesAttempted: 0,
            });
          } else {
            if (!silent) {
              console.log(`[EXTERNAL] Invalid transfer: ${validation.error}`);
            }
            resolve({
              exists: false,
              statusCode,
              error: validation.error || "Invalid external transfer link",
              retriesAttempted: 0,
            });
          }
        });
      });

      req.on("error", (error) => {
        if (!silent) {
          console.log(`[EXTERNAL] Request error: ${error.message}`);
        }
        resolve({
          exists: false,
          error: error.message,
          retriesAttempted: 0,
        });
      });

      req.on("timeout", () => {
        req.destroy();
        if (!silent) {
          console.log(`[EXTERNAL] Request timeout`);
        }
        resolve({
          exists: false,
          error: "Request timeout",
          retriesAttempted: 0,
        });
      });

      req.end();
    });
  }

  /**
   * Download a file with retry logic
   */
  async downloadFile(
    url: string,
    destination: string,
    options?: { maxFileSize?: number; timeout?: number }
  ): Promise<DownloadResult> {
    const maxRetries = RETRY_CONFIG.DOWNLOAD_ATTEMPTS;
    const timeout = options?.timeout ?? TIMEOUTS.DOWNLOAD;
    const maxFileSize = options?.maxFileSize;

    const result = await withRetry(
      async (attempt) => {
        console.log(`[DOWNLOAD] Download attempt ${attempt + 1}/${maxRetries}: ${url}`);

        return this.performDownload(url, destination, { maxFileSize, timeout });
      },
      (result) => !result.success,
      {
        maxRetries,
        delayMs: 2000,
        silent: false,
        operationName: "Download",
      }
    );

    return result.result;
  }

  /**
   * Perform the actual download operation
   */
  private async performDownload(
    url: string,
    destination: string,
    options: { maxFileSize?: number; timeout?: number }
  ): Promise<DownloadResult> {
    const { maxFileSize, timeout = TIMEOUTS.DOWNLOAD } = options;

    return new Promise((resolve) => {
      const protocol = url.startsWith("https") ? https : http;
      const file = fs.createWriteStream(destination);
      let downloadedSize = 0;
      let isResolved = false;

      const requestOptions = this.createRequestOptions(url, "GET", timeout);

      const req = protocol.get(url, requestOptions, (response) => {
        const statusCode = response.statusCode || 0;

        console.log(`[DOWNLOAD] Download response: ${statusCode} for ${url}`);

        // Handle redirects
        if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
          file.close();
          if (fs.existsSync(destination)) {
            fs.unlinkSync(destination);
          }

          const redirectUrl = new URL(response.headers.location, url).toString();
          console.log(`[REDIRECT] Following redirect to: ${redirectUrl}`);

          // Recursive call for redirect
          this.performDownload(redirectUrl, destination, options).then(resolve);
          return;
        }

        // Check if the response is successful
        if (statusCode >= 200 && statusCode < 300) {
          const contentType = response.headers["content-type"] || "";
          console.log(`Content-Type: ${contentType}`);

          const contentLength = Number.parseInt(response.headers["content-length"] || "0", 10);
          console.log(`[SIZE] Content-Length: ${formatFileSize(contentLength)}`);

          if (maxFileSize && contentLength > maxFileSize) {
            console.log(
              `File size ${formatFileSize(contentLength)} exceeds maximum allowed size of ${formatFileSize(maxFileSize)}`
            );
            file.close();
            if (fs.existsSync(destination)) {
              fs.unlinkSync(destination);
            }
            if (!isResolved) {
              isResolved = true;
              resolve({
                success: false,
                error: `File size ${formatFileSize(contentLength)} exceeds maximum`,
              });
            }
            return;
          }

          // Handle download progress
          response.on("data", (chunk) => {
            downloadedSize += chunk.length;
            if (maxFileSize && downloadedSize > maxFileSize) {
              console.log(`Download cancelled: File size exceeded during download`);
              req.destroy();
              file.close();
              if (fs.existsSync(destination)) {
                fs.unlinkSync(destination);
              }
              if (!isResolved) {
                isResolved = true;
                resolve({
                  success: false,
                  error: "File size exceeded during download",
                });
              }
            }
          });

          response.pipe(file);

          file.on("finish", () => {
            file.close();

            if (fs.existsSync(destination)) {
              const stats = fs.statSync(destination);
              if (stats.size > 0) {
                console.log(
                  `Successfully downloaded: ${destination} (${formatFileSize(stats.size)})`
                );
                if (!isResolved) {
                  isResolved = true;
                  resolve({
                    success: true,
                    filePath: destination,
                    fileSize: stats.size,
                  });
                }
              } else {
                console.log(`Downloaded file is empty: ${destination}`);
                fs.unlinkSync(destination);
                if (!isResolved) {
                  isResolved = true;
                  resolve({
                    success: false,
                    error: "Downloaded file is empty",
                  });
                }
              }
            } else {
              console.log(`Downloaded file not found: ${destination}`);
              if (!isResolved) {
                isResolved = true;
                resolve({
                  success: false,
                  error: "Downloaded file not found",
                });
              }
            }
          });

          file.on("error", (error) => {
            console.log(`File write error: ${error.message}`);
            file.close();
            if (fs.existsSync(destination)) {
              fs.unlinkSync(destination);
            }
            if (!isResolved) {
              isResolved = true;
              resolve({
                success: false,
                error: error.message,
              });
            }
          });
        } else {
          file.close();
          if (fs.existsSync(destination)) {
            fs.unlinkSync(destination);
          }
          console.log(`Download failed: HTTP ${statusCode}`);
          if (!isResolved) {
            isResolved = true;
            resolve({
              success: false,
              error: `HTTP ${statusCode}`,
            });
          }
        }
      });

      req.on("error", (error) => {
        file.close();
        if (fs.existsSync(destination)) {
          fs.unlinkSync(destination);
        }
        console.log(`Download request error: ${error.message}`);
        if (!isResolved) {
          isResolved = true;
          resolve({
            success: false,
            error: error.message,
          });
        }
      });

      req.on("timeout", () => {
        req.destroy();
        file.close();
        if (fs.existsSync(destination)) {
          fs.unlinkSync(destination);
        }
        console.log(`[TIMEOUT] Download timeout`);
        if (!isResolved) {
          isResolved = true;
          resolve({
            success: false,
            error: "Request timeout",
          });
        }
      });
    });
  }

  /**
   * Create HTTP request options
   */
  private createRequestOptions(
    url: string,
    method: "GET" | "HEAD",
    timeout: number
  ): http.RequestOptions {
    return {
      method,
      headers: {
        ...REQUEST_HEADERS,
        Referer: new URL(url).origin,
      },
      timeout,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let httpClientInstance: HttpClient | null = null;

/**
 * Get the shared HttpClient instance
 */
export function getHttpClient(): HttpClient {
  if (!httpClientInstance) {
    httpClientInstance = new HttpClient();
  }
  return httpClientInstance;
}
