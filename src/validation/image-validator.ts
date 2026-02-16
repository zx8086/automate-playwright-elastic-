/* src/validation/image-validator.ts */

/**
 * Image validation module.
 * Validates images on pages using both browser-based and HTTP validation.
 */

import type { Page } from "@playwright/test";
import { config } from "../../config";
import { DEFAULT_TEXT, VALIDATION_LIMITS, VIDEO_SELECTORS } from "../constants";
import { getHttpClient, type HttpClient } from "../core/http-client";
import type { ImageValidationResult, RawImageData, VideoElement } from "../core/types";
import { TestState } from "../test-state";

// ============================================================================
// IMAGE VALIDATOR CLASS
// ============================================================================

export class ImageValidator {
  private httpClient: HttpClient;
  private testState: TestState;

  constructor(httpClient?: HttpClient, testState?: TestState) {
    this.httpClient = httpClient ?? getHttpClient();
    this.testState = testState ?? new TestState();
  }

  /**
   * Validate all images on a page
   */
  async validatePageImages(page: Page): Promise<ImageValidationResult> {
    const results: ImageValidationResult = {
      validImages: [],
      brokenImages: [],
      downloadableAssets: [],
    };

    try {
      // Wait a moment for any lazy-loaded images to start loading
      await page.waitForTimeout(1000);

      // Get all images including their loading status
      const imagesData = await this.getImagesFromPage(page);

      console.log(`   Found ${imagesData.length} images on page`);

      // First, check for browser-detected broken images (most reliable)
      const browserBrokenImages = imagesData.filter((img) => img.isBroken && img.src);
      const validInBrowser = imagesData.filter((img) => !img.isBroken && img.src);

      if (browserBrokenImages.length > 0) {
        console.log(`   Browser detected ${browserBrokenImages.length} broken images`);
        browserBrokenImages.forEach((img) => {
          results.brokenImages.push({
            src: img.src,
            alt: img.alt || img.title || img.parentText || DEFAULT_TEXT.NO_CONTEXT,
            error: `Failed to load in browser (naturalWidth=${img.naturalWidth}, complete=${img.complete})`,
          });
        });
      }

      // Track total images found globally
      this.testState.incrementTotalLinksFound(imagesData.length);

      // For images that loaded in browser, optionally verify via HTTP
      const maxHttpValidations = Math.min(
        validInBrowser.length,
        config.allowedDownloads.maxImagesToValidate || VALIDATION_LIMITS.MAX_IMAGES_TO_VALIDATE
      );

      console.log(
        `   Validating ${maxHttpValidations} of ${validInBrowser.length} browser-loaded images via HTTP...`
      );

      // HTTP validation for images that loaded in browser
      for (let i = 0; i < Math.min(validInBrowser.length, maxHttpValidations); i++) {
        const img = validInBrowser[i];
        if (!img.src) continue;

        try {
          const check = await this.httpClient.verifyResource(img.src, { silent: true });

          if (check.exists) {
            results.validImages.push({
              src: img.src,
              alt: img.alt || img.title || "",
            });
          } else {
            results.brokenImages.push({
              src: img.src,
              alt: img.alt || img.title || img.parentText || "",
              statusCode: check.statusCode,
              error: check.error || "HTTP validation failed (may be CORS restricted)",
            });
          }
        } catch (_error) {
          console.log(`   Could not validate: ${img.src}`);
        }
      }

      // Also check for clickable asset links (images wrapped in anchor tags)
      const assetLinks = await this.getAssetLinks(page);

      // Also check for video links if configured
      const videoElements = await this.getVideoElements(page);

      // Validate videos if any found
      await this.validateVideos(videoElements, results);

      // Check asset links for broken ones too
      await this.validateAssetLinks(assetLinks, results);
    } catch (error) {
      console.log(
        `Error validating asset images: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return results;
  }

  /**
   * Get all images from a page with their loading status
   */
  private async getImagesFromPage(page: Page): Promise<RawImageData[]> {
    return page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      const pictureImgs = Array.from(document.querySelectorAll("picture img"));
      const allImgs = [...new Set([...imgs, ...pictureImgs])];

      return allImgs.map((img) => {
        const htmlImg = img as HTMLImageElement;
        const src = htmlImg.currentSrc || htmlImg.src || htmlImg.getAttribute("data-src") || "";
        const srcset = htmlImg.srcset || "";

        const isBroken =
          !htmlImg.complete ||
          htmlImg.naturalWidth === 0 ||
          htmlImg.naturalHeight === 0 ||
          (!src && !srcset);

        return {
          src: src,
          srcset: srcset,
          alt: htmlImg.alt || "",
          title: htmlImg.title || "",
          naturalWidth: htmlImg.naturalWidth,
          naturalHeight: htmlImg.naturalHeight,
          complete: htmlImg.complete,
          isBroken: isBroken,
          parentText: htmlImg.parentElement?.textContent?.trim().substring(0, 100) || "",
        };
      });
    });
  }

  /**
   * Get asset links from a page
   */
  private async getAssetLinks(
    page: Page
  ): Promise<Array<{ href: string; text: string; innerHTML: string }>> {
    return page.$$eval('a[href*="/assets/"]', (links) =>
      links.map((link) => ({
        href: (link as HTMLAnchorElement).href,
        text: (link as HTMLAnchorElement).textContent?.trim() || "",
        innerHTML: (link as HTMLAnchorElement).innerHTML,
      }))
    );
  }

  /**
   * Get video elements from a page
   */
  private async getVideoElements(page: Page): Promise<VideoElement[]> {
    const elements = await page.$$eval(VIDEO_SELECTORS, (elements) =>
      elements
        .map((el) => {
          if (el.tagName === "SOURCE") {
            return { url: (el as HTMLSourceElement).src, type: "video" as const };
          } else if (el.tagName === "IFRAME") {
            return { url: (el as HTMLIFrameElement).src, type: "embed" as const };
          } else if (el.tagName === "A") {
            return { url: (el as HTMLAnchorElement).href, type: "download" as const };
          }
          return null;
        })
        .filter(Boolean)
    );

    return elements.filter((el): el is VideoElement => el !== null);
  }

  /**
   * Validate video elements
   */
  private async validateVideos(
    videoElements: VideoElement[],
    results: ImageValidationResult
  ): Promise<void> {
    const maxVideosToValidate =
      config.allowedDownloads.maxVideosToValidate || VALIDATION_LIMITS.MAX_VIDEOS_TO_VALIDATE;

    if (videoElements.length > 0) {
      console.log(
        `   Found ${videoElements.length} video links, validating up to ${maxVideosToValidate}...`
      );
      const videosToCheck = videoElements.slice(0, maxVideosToValidate);

      for (const video of videosToCheck) {
        if (video && typeof video === "object" && "url" in video) {
          const check = await this.httpClient.verifyResource(video.url, { silent: true });
          if (!check.exists) {
            this.testState.incrementBrokenVideos();
            results.brokenImages.push({
              src: video.url,
              alt: `Video (${video.type})`,
              correctedUrl: undefined,
              statusCode: check.statusCode,
              error: check.error || "Resource not found",
            });
          }
        }
      }

      // Track video statistics separately
      this.testState.incrementVideosFound(videoElements.length);
      this.testState.incrementVideosValidated(Math.min(videoElements.length, maxVideosToValidate));
    }
  }

  /**
   * Validate asset links
   */
  private async validateAssetLinks(
    assetLinks: Array<{ href: string; text: string; innerHTML: string }>,
    results: ImageValidationResult
  ): Promise<void> {
    for (const link of assetLinks) {
      if (link.href.match(/\.(jpg|jpeg|png|gif|webp|pdf|zip)$/i)) {
        const check = await this.httpClient.verifyResource(link.href, { silent: true });

        if (!check.exists) {
          // This is a broken download link - just report it
          results.brokenImages.push({
            src: link.href,
            alt: link.text || "Download link",
            correctedUrl: undefined,
            statusCode: check.statusCode,
            error: check.error || "Resource not found",
          });
        }
      }
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let imageValidatorInstance: ImageValidator | null = null;

/**
 * Get the shared ImageValidator instance
 */
export function getImageValidator(testState?: TestState): ImageValidator {
  if (!imageValidatorInstance) {
    imageValidatorInstance = new ImageValidator(getHttpClient(), testState);
  }
  return imageValidatorInstance;
}

/**
 * Create a new ImageValidator instance with specific dependencies
 */
export function createImageValidator(httpClient: HttpClient, testState: TestState): ImageValidator {
  return new ImageValidator(httpClient, testState);
}
