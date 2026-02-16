/* src/navigation/page-scanner.ts */

/**
 * Page element scanning module.
 * Scans pages for download links, element counts, and page-specific elements.
 */

import type { Page } from "@playwright/test";
import { CRITICAL_SELECTORS, DOWNLOAD_SELECTORS } from "../constants";
import type { DownloadLink, PageElementCounts } from "../core/types";

// ============================================================================
// PAGE SCANNER CLASS
// ============================================================================

export class PageScanner {
  /**
   * Get element counts for page metadata
   */
  async getElementCounts(page: Page): Promise<PageElementCounts> {
    const counts = {
      images: await page.locator("img").count(),
      paragraphs: await page.locator("p").count(),
      headings: await page.locator("h1, h2, h3, h4, h5, h6").count(),
      links: await page.locator("a").count(),
      buttons: await page.locator('button, [role="button"]').count(),
    };

    return counts;
  }

  /**
   * Scan a page for download links
   */
  async scanForDownloads(page: Page, pageName: string): Promise<DownloadLink[]> {
    console.log(`[SCAN] Scanning "${pageName}" for download links...`);

    const downloadLinks = await page.evaluate((downloadSelectors) => {
      const downloads: Array<{
        text: string;
        href: string;
        fullText: string;
        isDownload: boolean;
        isMalformed?: boolean;
      }> = [];

      // Enhanced selectors for download links on the current page
      for (const selector of downloadSelectors) {
        try {
          const links = document.querySelectorAll(selector);

          for (const link of links) {
            const href = link.getAttribute("href");
            if (
              !href ||
              href === "#" ||
              href.startsWith("javascript:") ||
              href.startsWith("mailto:")
            ) {
              continue;
            }

            if (href.endsWith("/assets/") || href.endsWith("/assets")) {
              continue; // Skip assets page URLs, they're not downloads
            }

            const text = link.textContent?.trim() || "";
            if (!text) continue;

            // Check for malformed URLs (path incorrectly concatenated with external URL)
            const isMalformedUrl =
              (href.includes("https://") && !href.startsWith("https://")) ||
              (href.includes("http://") &&
                !href.startsWith("http://") &&
                !href.startsWith("https://"));

            // Determine if this is actually a download
            const isDownload =
              href.includes(".pdf") ||
              href.includes(".zip") ||
              href.includes(".rar") ||
              href.includes(".7z") ||
              href.includes("/assets/") ||
              href.includes("/download") ||
              href.includes("/media/") ||
              href.includes("/files/") ||
              href.includes("product.zip") ||
              href.includes("stills.zip") ||
              href.includes("images.zip") ||
              href.includes("campaign.zip") ||
              text.toLowerCase().includes("download") ||
              text.toLowerCase().includes("stills") ||
              text.toLowerCase().includes("high-res") ||
              text.toLowerCase().includes("assets") ||
              link.hasAttribute("download") ||
              // External transfer URL pattern (generic)
              href.includes("/transfer/") ||
              isMalformedUrl;

            if (isDownload && !downloads.some((d) => d.href === href)) {
              downloads.push({
                text,
                href,
                fullText: text,
                isDownload: true,
                isMalformed: isMalformedUrl,
              });
            }
          }
        } catch (_e) {
          // Ignore errors for parent context extraction
        }
      }

      return downloads;
    }, DOWNLOAD_SELECTORS);

    if (downloadLinks.length > 0) {
      console.log(`[FOUND] Found ${downloadLinks.length} download links on "${pageName}":`);
      downloadLinks.forEach((link, idx) => {
        const malformedWarning = link.isMalformed ? " [MALFORMED URL]" : "";
        console.log(`   ${idx + 1}. [DL] ${link.text} (${link.href})${malformedWarning}`);
      });
      return downloadLinks;
    } else {
      console.log(`[INFO] No download links found on "${pageName}"`);
      return [];
    }
  }

  /**
   * Check for page-specific elements and trigger lazy loading
   */
  async checkPageElements(page: Page, pageName: string): Promise<DownloadLink[]> {
    // Scroll to trigger lazy loading of images and assets
    await this.triggerLazyLoading(page);

    // Wait for any triggered lazy loading
    await page.waitForTimeout(2000);

    // Get element counts
    const elementCounts = await this.getElementCounts(page);
    console.log(` Page "${pageName}" contains: ${JSON.stringify(elementCounts)}`);

    // Log page-specific element information
    await this.logPageSpecificElements(page, pageName);

    // Check for missing critical elements
    await this.checkCriticalElements(page);

    // Scan for download links
    const pageNameLower = pageName.toLowerCase();
    if (
      pageNameLower.includes("asset") ||
      pageNameLower.includes("image") ||
      pageNameLower.includes("media") ||
      pageNameLower.includes("gallery") ||
      pageNameLower.includes("stills")
    ) {
      return this.scanForDownloads(page, pageName);
    }

    return this.scanForDownloads(page, pageName);
  }

  /**
   * Trigger lazy loading by scrolling through the page
   */
  private async triggerLazyLoading(page: Page): Promise<void> {
    await page.evaluate(async () => {
      const scrollToBottomEnhanced = async () => {
        const scrollHeight = document.documentElement.scrollHeight;
        const viewportHeight = window.innerHeight;
        const totalSteps = Math.ceil(scrollHeight / viewportHeight);

        console.log(`[SCROLL] Starting enhanced scroll: ${totalSteps} steps for lazy loading`);

        for (let step = 0; step < totalSteps; step++) {
          const scrollTo = step * viewportHeight;
          window.scrollTo({ top: scrollTo, behavior: "smooth" });

          // Wait longer for lazy loading to trigger
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Check for new images that might have loaded
          const newImages = document.querySelectorAll(
            'img[loading="lazy"], img[data-src], img[src*="nextImageExportOptimizer"]'
          );
          if (newImages.length > 0) {
            console.log(` Found ${newImages.length} lazy images at scroll position ${scrollTo}`);
          }
        }

        // Final scroll to bottom and hold
        window.scrollTo({ top: scrollHeight, behavior: "smooth" });
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Scroll back to top slowly
        window.scrollTo({ top: 0, behavior: "smooth" });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      };

      await scrollToBottomEnhanced();
    });
  }

  /**
   * Log page-specific element information
   */
  private async logPageSpecificElements(page: Page, pageName: string): Promise<void> {
    const pageNameLower = pageName.toLowerCase();

    if (pageNameLower.includes("bio") || pageNameLower.includes("about")) {
      const bioElements = await page.locator("article, .bio, .biography, .about, .profile").count();
      const textBlocks = await page.locator("p, .text, .content").count();
      console.log(
        `[BIO] Biography page elements: ${bioElements} bio sections, ${textBlocks} text blocks`
      );
    } else if (pageNameLower.includes("contact")) {
      const contactElements = await page
        .locator('form, [type="email"], [type="tel"], address, .contact')
        .count();
      const socialLinks = await page
        .locator('a[href*="instagram"], a[href*="twitter"], a[href*="facebook"]')
        .count();
      console.log(
        `[CONTACT] Contact page elements: ${contactElements} contact forms, ${socialLinks} social links`
      );
    } else if (
      pageNameLower.includes("asset") ||
      pageNameLower.includes("image") ||
      pageNameLower.includes("media") ||
      pageNameLower.includes("gallery") ||
      pageNameLower.includes("stills")
    ) {
      const galleryElements = await page.locator(".gallery, .grid, .assets, .media-grid").count();
      const downloadLinks = await page
        .locator('a[href*=".zip"], a[href*="download"], .download')
        .count();
      const images = await page.locator("img").count();
      const videos = await page.locator("video, .video").count();

      console.log(`[ASSETS] Asset page elements:`);
      console.log(`   - Gallery containers: ${galleryElements}`);
      console.log(`   - Download links: ${downloadLinks}`);
      console.log(`   - Images: ${images}`);
      console.log(`   - Videos: ${videos}`);

      // Check for high-resolution image links
      const hiResImages = await page
        .locator(
          'img[src*="7016w"], img[src*="3360w"], img[src*="_high"], img[src*="_large"], img[src*="nextImageExportOptimizer"]'
        )
        .count();
      console.log(`   - High-res/optimized images: ${hiResImages}`);
    } else if (pageNameLower.includes("press") || pageNameLower.includes("release")) {
      const pressElements = await page.locator(".press, .release, .news, article").count();
      const pdfLinks = await page.locator('a[href*=".pdf"]').count();
      console.log(
        `[PRESS] Press page elements: ${pressElements} press sections, ${pdfLinks} PDF downloads`
      );
    } else if (pageNameLower.includes("video")) {
      const videoElements = await page
        .locator('video, iframe[src*="youtube"], iframe[src*="vimeo"], .video')
        .count();
      const videoDownloads = await page.locator('a[href*=".mp4"], a[href*=".mov"]').count();
      console.log(
        `[VIDEO] Video page elements: ${videoElements} video players, ${videoDownloads} video downloads`
      );
    }
  }

  /**
   * Check for missing critical elements
   */
  private async checkCriticalElements(page: Page): Promise<void> {
    const hasMissingElements = await page.evaluate((criticalSelectors) => {
      const missingElements = criticalSelectors.filter(
        (selector) => document.querySelectorAll(selector).length === 0
      );
      return missingElements;
    }, CRITICAL_SELECTORS);

    if (hasMissingElements.length > 0) {
      console.log(`Missing critical elements: ${hasMissingElements.join(", ")}`);
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let pageScannerInstance: PageScanner | null = null;

/**
 * Get the shared PageScanner instance
 */
export function getPageScanner(): PageScanner {
  if (!pageScannerInstance) {
    pageScannerInstance = new PageScanner();
  }
  return pageScannerInstance;
}
