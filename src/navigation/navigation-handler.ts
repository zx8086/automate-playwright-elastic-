/* src/navigation/navigation-handler.ts */

/**
 * Navigation discovery module.
 * Identifies navigation items on pages using multiple selector strategies.
 */

import type { Page } from "@playwright/test";
import {
  DEFAULT_TEXT,
  DOWNLOAD_KEYWORDS,
  DOWNLOADABLE_EXTENSIONS,
  NAVIGATION_SELECTORS,
} from "../constants";
import type { NavigationItem } from "../core/types";

// ============================================================================
// NAVIGATION HANDLER CLASS
// ============================================================================

export class NavigationHandler {
  /**
   * Discover all navigation items on a page
   */
  async discoverNavigation(page: Page): Promise<NavigationItem[]> {
    console.log("[NAV] Analyzing navigation structure with enhanced detection...");

    const navItems = await page.evaluate(
      ({
        navigationSelectors,
        downloadableExtensions,
        downloadKeywords,
        defaultDownloadText,
      }: {
        navigationSelectors: readonly string[];
        downloadableExtensions: string[];
        downloadKeywords: readonly string[];
        defaultDownloadText: string;
      }) => {
        const cleanText = (html: string | null): string => {
          if (!html) return "";
          return html
            .replace(/<br\s*\/?>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        };

        const items: Array<{
          text: string;
          href: string;
          fullText: string;
          isDownload: boolean;
        }> = [];

        // Try each selector
        for (const selector of navigationSelectors) {
          const links = document.querySelectorAll(selector);

          for (const link of links) {
            const href = link.getAttribute("href");
            if (
              !href ||
              href === "#" ||
              href.startsWith("javascript:") ||
              href.startsWith("mailto:") ||
              href.startsWith("tel:")
            ) {
              continue;
            }

            // Get text content, handling nested elements
            let text = "";
            let fullText = "";

            if (link.children.length > 0) {
              // Handle nested elements
              const childTexts = Array.from(link.children)
                .map((child) => cleanText(child.textContent))
                .filter(Boolean);

              text = childTexts[0] || cleanText(link.textContent);
              fullText = childTexts.join(" ").trim() || text;
            } else {
              text = cleanText(link.textContent);
              fullText = text;
            }

            if (!text) continue;

            // Check for file extension
            const extension = href.split(".").pop()?.toLowerCase() || "";
            const hasFileExtension = downloadableExtensions.includes(extension);

            // Check for assets directory (page, not download)
            const isAssetsDirectory =
              (href.endsWith("/assets/") || href.endsWith("/assets")) && !hasFileExtension;

            // Skip assets directories - they're pages, not downloads
            if (isAssetsDirectory) {
              if (!items.some((item) => item.href === href)) {
                items.push({
                  text,
                  href: href as string,
                  fullText,
                  isDownload: false,
                });
              }
              continue;
            }

            // Check if URL matches download keywords
            const hrefLower = href.toLowerCase();
            const textLower = text.toLowerCase();
            const matchesKeyword = downloadKeywords.some((keyword) =>
              hrefLower.includes(keyword.toLowerCase())
            );
            const textIndicatesDownload = textLower.includes("download");

            // Determine if this is a download
            const isDownload = hasFileExtension || matchesKeyword || textIndicatesDownload;

            // Check if this link is already in our list
            if (!items.some((item) => item.href === href)) {
              items.push({
                text,
                href: href as string,
                fullText,
                isDownload,
              });
            }
          }
        }

        // Check for hidden download links that may be revealed on hover
        const potentialDownloads = document.querySelectorAll(
          "[data-download], [data-file], .download-link, .download-btn"
        );
        for (const element of potentialDownloads) {
          const href =
            element.getAttribute("href") ||
            element.getAttribute("data-href") ||
            element.getAttribute("data-url");

          if (href) {
            const text = element.textContent?.trim() || defaultDownloadText;
            if (!items.some((item) => item.href === href)) {
              items.push({
                text,
                href,
                fullText: text,
                isDownload: true,
              });
            }
          }
        }

        console.log(`Found ${items.length} navigation items with enhanced detection`);
        return items;
      },
      {
        navigationSelectors: NAVIGATION_SELECTORS,
        downloadableExtensions: DOWNLOADABLE_EXTENSIONS.map((ext) => ext.slice(1)),
        downloadKeywords: DOWNLOAD_KEYWORDS,
        defaultDownloadText: DEFAULT_TEXT.DOWNLOAD_FALLBACK,
      }
    );

    // Fallback if no items found
    if (navItems.length === 0) {
      console.log(
        " No navigation items found with enhanced selectors, trying comprehensive fallback..."
      );
      return this.fallbackDiscovery(page);
    }

    console.log(`Enhanced navigation detection found ${navItems.length} items`);
    return navItems;
  }

  /**
   * Fallback navigation discovery when primary selectors fail
   */
  private async fallbackDiscovery(page: Page): Promise<NavigationItem[]> {
    // Try to find any links on the page
    const allLinks = await page.$$eval("a[href]", (links) =>
      links
        .map((link) => ({
          href: (link as HTMLAnchorElement).href,
          text: (link as HTMLAnchorElement).textContent?.trim() || "",
        }))
        .filter((link) => {
          const href = link.href;
          return (
            href &&
            !href.startsWith("javascript:") &&
            !href.startsWith("mailto:") &&
            !href.startsWith("tel:") &&
            href !== "#"
          );
        })
    );

    console.log(`Fallback found ${allLinks.length} links`);

    return allLinks.map((link) => ({
      text: link.text || "Link",
      href: link.href,
      fullText: link.text || "Link",
      isDownload: this.classifyAsDownload(link.href, link.text),
    }));
  }

  /**
   * Classify a link as a download based on URL and text
   */
  private classifyAsDownload(href: string, text: string): boolean {
    const hrefLower = href.toLowerCase();
    const textLower = text.toLowerCase();

    // Check file extension
    const extension = href.split(".").pop()?.toLowerCase() || "";
    const downloadableExtensions = DOWNLOADABLE_EXTENSIONS.map((ext) => ext.slice(1));
    if (downloadableExtensions.includes(extension)) {
      return true;
    }

    // Check keywords
    const matchesKeyword = DOWNLOAD_KEYWORDS.some((keyword) =>
      hrefLower.includes(keyword.toLowerCase())
    );
    if (matchesKeyword) {
      return true;
    }

    // Check text
    if (textLower.includes("download")) {
      return true;
    }

    return false;
  }

  /**
   * Filter navigation items to only include downloads
   */
  filterDownloads(items: NavigationItem[]): NavigationItem[] {
    return items.filter((item) => item.isDownload);
  }

  /**
   * Filter navigation items to only include regular pages
   */
  filterPages(items: NavigationItem[]): NavigationItem[] {
    return items.filter((item) => !item.isDownload);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let navigationHandlerInstance: NavigationHandler | null = null;

/**
 * Get the shared NavigationHandler instance
 */
export function getNavigationHandler(): NavigationHandler {
  if (!navigationHandlerInstance) {
    navigationHandlerInstance = new NavigationHandler();
  }
  return navigationHandlerInstance;
}
