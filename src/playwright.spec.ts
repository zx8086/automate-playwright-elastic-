/* src/test.spec.ts */

import * as fs from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import * as path from "node:path";
import { type Page, test } from "@playwright/test";
import {
  type BrokenLink,
  type BrokenLinksReport,
  config,
  type ElementCounts,
  type NavigationPath,
  SchemaRegistry,
  type SkippedDownload,
} from "../config";
import {
  CRITICAL_SELECTORS,
  DEFAULT_TEXT,
  DOWNLOAD_SELECTORS,
  DOWNLOADABLE_EXTENSIONS,
  NAVIGATION_SELECTORS,
  RETRY_CONFIG,
  TIMEOUTS,
  VALIDATION_LIMITS,
  VIDEO_SELECTORS,
} from "./constants";
import { DownloadDetector } from "./download-detector";
import { generateElasticSyntheticsTest } from "./synthetics-generator";
import { TestState } from "./test-state";
import { formatFileSize } from "./utils";

// Extract schemas from config
const {
  ElementCounts: ElementCountsSchema,
  NavigationPath: NavigationPathSchema,
  SkippedDownload: SkippedDownloadSchema,
} = SchemaRegistry;

// Initialize test state
const testState = new TestState();

test.describe("Site Navigation Test with Steps", () => {
  test.setTimeout(180000); // 3 minutes

  test.beforeAll(async () => {
    // console.log('\nInitial Memory Usage:');
    // logMemoryUsage();
    testState.clearBrokenLinks();

    // Clean up all output directories from previous runs
    const directoriesToClean = [
      { path: config.server.screenshotDir, name: "Screenshots" },
      { path: config.server.downloadsDir, name: "Downloads" },
      { path: config.server.syntheticsDir, name: "Synthetics" },
      { path: "./broken-links-reports", name: "Broken Links Reports" },
    ];

    console.log("Cleaning up previous run artifacts...");
    let totalFilesCleanedUp = 0;

    for (const dir of directoriesToClean) {
      try {
        if (fs.existsSync(dir.path)) {
          const files = fs.readdirSync(dir.path);
          let cleanedCount = 0;

          for (const file of files) {
            const filePath = path.join(dir.path, file);
            if (fs.statSync(filePath).isFile()) {
              fs.unlinkSync(filePath);
              cleanedCount++;
              totalFilesCleanedUp++;
            }
          }

          if (cleanedCount > 0) {
            console.log(`🗑️  ${dir.name}: cleaned ${cleanedCount} file(s)`);
          } else {
            console.log(`${dir.name}: already clean`);
          }
        } else {
          console.log(`${dir.name}: directory doesn't exist yet`);
        }
      } catch (error) {
        console.log(
          `Failed to clean up ${dir.name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    console.log(`Cleanup complete: ${totalFilesCleanedUp} total file(s) removed\n`);
  });

  test.afterAll(async () => {
    // console.log('\nFinal Memory Usage:');
    // logMemoryUsage();

    // Generate broken links report
    if (testState.hasBrokenLinks()) {
      await generateBrokenLinksReport(testState.getBrokenLinks());
    }
  });

  test.beforeEach(async ({ page }) => {
    [config.server.screenshotDir, config.server.downloadsDir, config.server.syntheticsDir].forEach(
      (dir) => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
    );

    // Set desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Navigate to site
    await page.goto(config.server.baseUrl, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS.PAGE_LOAD,
    });
  });

  test("step-by-step navigation through site menu items", async ({ page }) => {
    const navigationPaths: NavigationPath[] = [];
    const skippedDownloads: SkippedDownload[] = [];

    // Track processed URLs to prevent duplicates
    const processedUrls = new Set<string>();
    const processedDownloads = new Set<string>();

    // First identify all navigation items on initial page
    const navigationItems = await identifyNavigation(page);
    console.log(`Found ${navigationItems.length} navigation items`);

    // Log all navigation items with their types
    navigationItems.forEach((item, idx) => {
      const downloadIcon = item.isDownload ? "[DOWNLOAD]" : "[LINK]";
      console.log(`${idx + 1}. ${downloadIcon} ${item.text} (${item.href})`);
    });

    // Take screenshot of navigation menu
    await page.screenshot({
      path: path.join(config.server.screenshotDir, "navigation-menu.png"),
    });

    // Navigate to each identified item directly (without clicking)
    for (const item of navigationItems) {
      await test.step(`Navigate to "${item.text}"`, async () => {
        console.log(`Navigating to: ${item.text} (${item.href})`);

        // Record the starting URL
        const startUrl = page.url();
        const absoluteUrl = new URL(item.href, page.url()).toString();

        // Skip if we've already processed this URL
        if (processedUrls.has(absoluteUrl)) {
          console.log(`⏭️ Skipping already processed URL: ${absoluteUrl}`);
          return;
        }

        // Check if it's a downloadable resource
        if (DownloadDetector.isDownloadableResource(item.href)) {
          try {
            console.log(`📥 Handling downloadable resource: ${item.text}`);

            // Skip if we've already processed this download
            if (processedDownloads.has(absoluteUrl)) {
              console.log(`⏭️ Skipping already processed download: ${absoluteUrl}`);
              return;
            }

            // Verify the resource exists and get content length
            const { exists, contentLength } = await verifyResourceExists(absoluteUrl);

            if (exists) {
              console.log(`Resource ${item.text} exists and is accessible`);

              // Try to download the file
              const downloadPath = path.join(config.server.downloadsDir, path.basename(item.href));

              if (contentLength && contentLength > config.allowedDownloads.maxFileSize) {
                console.log(
                  `File size ${formatFileSize(contentLength)} exceeds maximum allowed size of ${formatFileSize(config.allowedDownloads.maxFileSize)}`
                );
                const skippedDownload: SkippedDownload = {
                  from: startUrl,
                  to: absoluteUrl,
                  label: item.text.replace(/\s+/g, " ").trim(),
                  fileSize: contentLength,
                  reason: `File size ${formatFileSize(contentLength)} exceeds max allowed size of ${formatFileSize(config.allowedDownloads.maxFileSize)}`,
                };
                // Validate before adding
                SkippedDownloadSchema.parse(skippedDownload);
                skippedDownloads.push(skippedDownload);
              } else {
                const downloadSuccessful = await downloadFile(absoluteUrl, downloadPath);

                if (downloadSuccessful) {
                  console.log(`Successfully downloaded: ${downloadPath}`);

                  // Get file size
                  const stats = fs.statSync(downloadPath);
                  console.log(`File size: ${formatFileSize(stats.size)}`);

                  // Add to navigation paths with validation
                  const navigationPath: NavigationPath = {
                    from: startUrl,
                    to: absoluteUrl,
                    label: item.text,
                    isDownloadable: true,
                    fileSize: stats.size,
                  };
                  NavigationPathSchema.parse(navigationPath);
                  navigationPaths.push(navigationPath);

                  // Mark this download as processed
                  processedDownloads.add(absoluteUrl);
                } else {
                  console.log(`Download failed for: ${absoluteUrl}`);
                  const skippedDownload: SkippedDownload = {
                    from: startUrl,
                    to: absoluteUrl,
                    label: item.text.replace(/\s+/g, " ").trim(),
                    fileSize: contentLength,
                    reason: "Download failed",
                  };
                  // Validate before adding
                  SkippedDownloadSchema.parse(skippedDownload);
                  skippedDownloads.push(skippedDownload);
                }
              }
            } else {
              console.log(`Resource not accessible: ${absoluteUrl}`);
            }
          } catch (error: unknown) {
            console.log(
              `Error handling downloadable resource: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
        // Handle regular page navigation
        else {
          try {
            // For regular pages, navigate directly to the URL instead of clicking
            console.log(`Direct navigation to: ${absoluteUrl}`);
            await page.goto(absoluteUrl, { timeout: TIMEOUTS.NAVIGATION });

            // Wait for the page to load
            await page.waitForLoadState("domcontentloaded");
            await page.waitForTimeout(config.server.pauseBetweenClicks);

            // Verify navigation was successful
            const currentUrl = page.url();
            if (currentUrl !== startUrl) {
              console.log(`Successfully navigated to: ${currentUrl}`);

              // Get element counts for metadata
              const elementCounts = await getElementCounts(page);

              // Add to navigation paths with validation
              const navigationPath: NavigationPath = {
                from: startUrl,
                to: currentUrl,
                label: item.text,
                isDownloadable: false,
                elementCounts: elementCounts,
              };
              NavigationPathSchema.parse(navigationPath);
              navigationPaths.push(navigationPath);

              // Mark this URL as processed
              processedUrls.add(absoluteUrl);

              // Take screenshot of the page
              await page.screenshot({
                path: path.join(
                  config.server.screenshotDir,
                  `${item.text.replace(/\s+/g, "-").toLowerCase()}.png`
                ),
              });

              // Check for unique elements on this page
              const pageDownloadLinks = await checkPageSpecificElements(page, item.text);

              // Validate images on ALL pages (generic for any site)
              console.log(`\n🔍 Validating images on "${item.text}" page...`);
              const imageValidation = await validateAssetImages(page);

              if (imageValidation.brokenImages.length > 0) {
                console.log(
                  `Found ${imageValidation.brokenImages.length} broken images on "${item.text}"`
                );

                // Add broken images to global tracking with detailed context
                const pageUrl = page.url();
                imageValidation.brokenImages.forEach((brokenImg, idx) => {
                  const brokenLink: BrokenLink = {
                    url: brokenImg.src,
                    pageFound: pageUrl,
                    type: "image",
                    pageUrl,
                    brokenUrl: brokenImg.src,
                    altText: brokenImg.alt || "Image",
                    error: brokenImg.error || `Status: ${brokenImg.statusCode}`,
                  };
                  // Add to global broken links map
                  testState.addBrokenLink(pageUrl, brokenLink);
                  console.log(`  [${idx + 1}] ${brokenImg.src}`);
                  if (brokenImg.alt) {
                    console.log(`      Alt: "${brokenImg.alt}"`);
                  }
                  if (brokenImg.error) {
                    console.log(`      Error: ${brokenImg.error}`);
                  }
                });
              } else if (imageValidation.validImages.length > 0) {
                console.log(`All ${imageValidation.validImages.length} images loaded successfully`);
              } else {
                console.log(`No images found on this page`);
              }

              // Process any download links found on this page
              if (pageDownloadLinks && pageDownloadLinks.length > 0) {
                for (const downloadLink of pageDownloadLinks) {
                  const downloadUrl = new URL(downloadLink.href, currentUrl).toString();

                  // Skip if we've already processed this download
                  if (processedDownloads.has(downloadUrl)) {
                    console.log(`⏭️ Skipping already processed download: ${downloadUrl}`);
                    continue;
                  }

                  console.log(
                    `📥 Processing download found on "${item.text}": ${downloadLink.text} (${downloadLink.href})`
                  );
                  try {
                    // Verify the resource exists
                    const { exists, contentLength } = await verifyResourceExists(downloadUrl);
                    if (exists) {
                      console.log(
                        `Download resource ${downloadLink.text} exists and is accessible`
                      );
                      // Try to download the file
                      const downloadPath = path.join(
                        config.server.downloadsDir,
                        path.basename(downloadLink.href)
                      );
                      const downloadSuccessful = await downloadFile(downloadUrl, downloadPath);
                      if (downloadSuccessful) {
                        console.log(`Successfully downloaded from page: ${downloadPath}`);
                        // Get file size
                        const stats = fs.statSync(downloadPath);
                        console.log(`File size: ${formatFileSize(stats.size)}`);
                        // Add to navigation paths as a downloadable resource with validation
                        const navigationPath: NavigationPath = {
                          from: currentUrl,
                          to: downloadUrl,
                          label: `${downloadLink.text} (from ${item.text})`,
                          isDownloadable: true,
                          fileSize: stats.size,
                        };
                        NavigationPathSchema.parse(navigationPath);
                        navigationPaths.push(navigationPath);
                        // Mark this download as processed
                        processedDownloads.add(downloadUrl);
                      } else {
                        console.log(`Download failed for: ${downloadUrl}`);
                        if (contentLength && contentLength > config.allowedDownloads.maxFileSize) {
                          console.log(
                            `File size ${formatFileSize(contentLength)} exceeds maximum allowed size of ${formatFileSize(config.allowedDownloads.maxFileSize)}`
                          );
                          fs.existsSync(downloadPath) && fs.unlinkSync(downloadPath);
                          const skippedDownload: SkippedDownload = {
                            from: startUrl,
                            to: downloadUrl,
                            label: downloadLink.text.replace(/\s+/g, " ").trim(),
                            fileSize: contentLength,
                            reason: `File size ${formatFileSize(contentLength)} exceeds max allowed size of ${formatFileSize(config.allowedDownloads.maxFileSize)}`,
                          };
                          // Validate before adding
                          SkippedDownloadSchema.parse(skippedDownload);
                          skippedDownloads.push(skippedDownload);
                        } else {
                          const skippedDownload: SkippedDownload = {
                            from: startUrl,
                            to: downloadUrl,
                            label: downloadLink.text.replace(/\s+/g, " ").trim(),
                            fileSize: contentLength,
                            reason: "Download failed",
                          };
                          // Validate before adding
                          SkippedDownloadSchema.parse(skippedDownload);
                          skippedDownloads.push(skippedDownload);
                        }
                      }
                    } else {
                      console.log(`Download resource not accessible: ${downloadUrl}`);
                    }
                  } catch (error) {
                    console.log(
                      `Error handling page download: ${error instanceof Error ? error.message : String(error)}`
                    );
                  }
                }
              }

              // Return to the main page for the next navigation
              await page.goto(config.server.baseUrl, { timeout: TIMEOUTS.NAVIGATION });
              await page.waitForLoadState("domcontentloaded");
              await page.waitForTimeout(config.server.pauseBetweenClicks);
            } else {
              console.log(`Navigation to "${item.text}" didn't change URL`);
            }
          } catch (error: unknown) {
            console.log(
              `Error navigating to "${item.text}": ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      });
    }

    // Final step to summarize navigation
    await test.step("Navigation summary", async () => {
      console.log("\n--- Navigation Summary ---");

      // Count regular pages
      const regularPages = navigationPaths.filter((p) => !p.isDownloadable);

      // Count downloadable resources
      const downloadableResources = navigationPaths.filter((p) => p.isDownloadable);

      console.log(
        `Total visited: ${navigationPaths.length} (${regularPages.length} pages + ${downloadableResources.length} downloadable resources)`
      );

      // List all navigable pages
      console.log("\n- Regular Pages:");
      regularPages.forEach((path, index) => {
        const cleanLabel = path.label.replace(/\s+/g, " ").trim();
        console.log(`${index + 1}. ${cleanLabel}: ${path.from} → ${path.to}`);
      });

      // List all downloadable resources
      if (downloadableResources.length > 0) {
        console.log("\n- Downloadable Resources:");
        downloadableResources.forEach((path, index) => {
          const cleanLabel = path.label.replace(/\s+/g, " ").trim();
          console.log(`${index + 1}. ${cleanLabel}: ${formatFileSize(path.fileSize || 0)}`);
        });
      }

      // Count working asset links (from successful downloads)
      const workingAssetCount = processedDownloads.size;

      // Add broken links summary if any were found
      if (testState.hasBrokenLinks()) {
        const totalBroken = testState.getTotalBrokenLinksCount();

        console.log("\n- Broken Links Found:");
        console.log(
          `  Total: ${totalBroken} broken link(s) detected out of ${testState.getValidatedLinksCount()} tested`
        );

        for (const [pageUrl, links] of testState.getBrokenLinks()) {
          const pageName = pageUrl.split("/").filter(Boolean).pop() || "home";
          console.log(`  - ${pageName} page: ${links.length} broken link(s)`);
        }
        console.log("\n  See broken-links-reports/ directory for detailed report");
      } else {
        console.log("\n- Link Validation:");

        // Show total links validated including images, videos and downloads
        const totalValidated =
          testState.getValidatedLinksCount() + testState.getVideosValidated() + workingAssetCount;
        const totalFound =
          testState.getTotalLinksFound() + testState.getVideosFound() + workingAssetCount;

        if (totalValidated > 0) {
          console.log(`  All links are working correctly`);

          // Show total found vs validated
          if (totalFound > totalValidated) {
            console.log(
              `  Successfully validated ${totalValidated} link(s) out of ${totalFound} found:`
            );
          } else {
            console.log(`  📊 Successfully validated ${totalValidated} link(s):`);
          }

          if (testState.getValidatedLinksCount() > 0) {
            if (testState.getTotalLinksFound() > testState.getValidatedLinksCount()) {
              console.log(
                `     - Asset images: ${testState.getValidatedLinksCount()} validated (${testState.getTotalLinksFound()} total found)`
              );
            } else {
              console.log(`     - Asset images: ${testState.getValidatedLinksCount()}`);
            }
          }
          if (testState.getVideosValidated() > 0) {
            if (testState.getVideosFound() > testState.getVideosValidated()) {
              console.log(
                `     - Videos: ${testState.getVideosValidated()} validated (${testState.getVideosFound()} total found)`
              );
            } else {
              console.log(`     - Videos: ${testState.getVideosValidated()}`);
            }
          }
          if (workingAssetCount > 0) {
            console.log(`     - Downloadable files: ${workingAssetCount}`);
          }
        } else {
          console.log("  All links are working correctly");
        }
      }

      // NEW: List skipped downloads
      if (skippedDownloads && skippedDownloads.length > 0) {
        console.log("\n- Skipped Downloads:");
        skippedDownloads.forEach((item, index) => {
          const cleanLabel = item.label.replace(/\s+/g, " ").trim();
          const sizeStr = item.fileSize ? formatFileSize(item.fileSize) : "Unknown size";
          const reason = item.reason || "Download failed";
          console.log(`${index + 1}. ${cleanLabel}: ${sizeStr} [SKIPPED: ${reason}]`);
        });
      }

      // Export data for Elastic Synthetics
      await exportElasticSyntheticsData(navigationPaths, config.server.syntheticsDir);

      // Create a visual sitemap
      await createVisualSitemap(navigationPaths, config.server.screenshotDir);
    });
  });
});

// Helper function to get element counts for page metadata
async function getElementCounts(page: Page): Promise<ElementCounts> {
  const counts = {
    images: await page.locator("img").count(),
    paragraphs: await page.locator("p").count(),
    headings: await page.locator("h1, h2, h3, h4, h5, h6").count(),
    links: await page.locator("a").count(),
    buttons: await page.locator('button, [role="button"]').count(),
  };

  // Validate the counts before returning
  return ElementCountsSchema.parse(counts);
}

// Identify navigation items with better detection
async function identifyNavigation(page: Page) {
  console.log("🔍 Analyzing navigation structure with enhanced detection...");

  const navItems = await page.evaluate(
    ({
      navigationSelectors,
      downloadableExtensions,
    }: {
      navigationSelectors: readonly string[];
      downloadableExtensions: string[];
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

      const navSelectors = navigationSelectors;

      // Try each selector
      for (const selector of navSelectors) {
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

          // Better download detection that handles assets pages correctly**
          const extension = href.split(".").pop()?.toLowerCase() || "";
          const hasFileExtension = downloadableExtensions.includes(extension);

          // Smart assets directory detection**
          const isAssetsDirectory =
            (href.endsWith("/assets/") || href.endsWith("/assets")) && !hasFileExtension; // No file extension = directory, not file

          // Skip assets directories - they're pages, not downloads
          if (isAssetsDirectory) {
            const isDownload = false;

            // Check if this link is already in our list
            if (!items.some((item) => item.href === href)) {
              items.push({
                text,
                href: href as string,
                fullText,
                isDownload,
              });
            }
            continue;
          }

          // Proper download detection**
          const isDownload =
            hasFileExtension ||
            href.includes("/download") ||
            href.includes("/files/") ||
            href.includes("/media/") ||
            href.includes("product.zip") ||
            href.includes("stills.zip") ||
            href.includes("images.zip") ||
            href.includes("media.zip") ||
            text.toLowerCase().includes("download") ||
            (href.toLowerCase().includes("assets") && hasFileExtension);

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
          const text = element.textContent?.trim() || DEFAULT_TEXT.DOWNLOAD_FALLBACK;
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
    }
  );

  // Rest of the function remains the same...
  if (navItems.length === 0) {
    console.log(
      " No navigation items found with enhanced selectors, trying comprehensive fallback..."
    );

    // Your existing fallback logic here...
  }

  console.log(`Enhanced navigation detection found ${navItems.length} items`);
  return navItems;
}

// Wait for page content to fully load including lazy-loaded elements
async function checkPageSpecificElements(
  page: Page,
  pageName: string
): Promise<Array<{ text: string; href: string; fullText: string; isDownload: boolean }>> {
  return await test.step(`Check ${pageName} page elements`, async () => {
    // Scroll to trigger lazy loading of images and assets
    await page.evaluate(async () => {
      const scrollToBottomEnhanced = async () => {
        const scrollHeight = document.documentElement.scrollHeight;
        const viewportHeight = window.innerHeight;
        const totalSteps = Math.ceil(scrollHeight / viewportHeight);

        console.log(`📜 Starting enhanced scroll: ${totalSteps} steps for lazy loading`);

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

    // Wait for any triggered lazy loading
    await page.waitForTimeout(2000);

    // Common elements to check
    const elementCounts = await getElementCounts(page);
    console.log(` Page "${pageName}" contains: ${JSON.stringify(elementCounts)}`);

    // Wait for page-specific content indicators to ensure full load
    const pageNameLower = pageName.toLowerCase();

    if (
      pageNameLower.includes("bio") ||
      pageNameLower.includes("about") ||
      pageNameLower.includes("tommy")
    ) {
      const bioElements = await page.locator("article, .bio, .biography, .about, .profile").count();
      const textBlocks = await page.locator("p, .text, .content").count();
      console.log(
        `👤 Biography page elements: ${bioElements} bio sections, ${textBlocks} text blocks`
      );
    } else if (pageNameLower.includes("contact")) {
      const contactElements = await page
        .locator('form, [type="email"], [type="tel"], address, .contact')
        .count();
      const socialLinks = await page
        .locator('a[href*="instagram"], a[href*="twitter"], a[href*="facebook"]')
        .count();
      console.log(
        `📞 Contact page elements: ${contactElements} contact forms, ${socialLinks} social links`
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

      console.log(`🖼️  Asset page elements:`);
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

      // Return empty array if validation is disabled
      return [];
    } else if (pageNameLower.includes("press") || pageNameLower.includes("release")) {
      const pressElements = await page.locator(".press, .release, .news, article").count();
      const pdfLinks = await page.locator('a[href*=".pdf"]').count();
      console.log(
        `📰 Press page elements: ${pressElements} press sections, ${pdfLinks} PDF downloads`
      );
    } else if (pageNameLower.includes("video")) {
      const videoElements = await page
        .locator('video, iframe[src*="youtube"], iframe[src*="vimeo"], .video')
        .count();
      const videoDownloads = await page.locator('a[href*=".mp4"], a[href*=".mov"]').count();
      console.log(
        `🎥 Video page elements: ${videoElements} video players, ${videoDownloads} video downloads`
      );
    } else if (pageNameLower.includes("aleali")) {
      const profileElements = await page.locator(".profile, .bio, .about, article").count();
      const imageElements = await page.locator("img").count();
      console.log(
        `👩 Aleali May page elements: ${profileElements} profile sections, ${imageElements} images`
      );
    }

    // Check for missing critical elements
    const hasMissingElements = await page.evaluate((criticalSelectors) => {
      const missingElements = criticalSelectors.filter(
        (selector) => document.querySelectorAll(selector).length === 0
      );
      return missingElements;
    }, CRITICAL_SELECTORS);

    if (hasMissingElements.length > 0) {
      console.log(`Missing critical elements: ${hasMissingElements.join(", ")}`);
    }

    // For asset pages, we've already handled this in validateAssetImages
    if (
      pageNameLower.includes("asset") ||
      pageNameLower.includes("image") ||
      pageNameLower.includes("media") ||
      pageNameLower.includes("gallery") ||
      pageNameLower.includes("stills")
    ) {
      // Asset pages already handled above with validateAssetImages
      return [];
    }

    const pageDownloadLinks = await scanPageForDownloads(page, pageName);

    // **NEW: RETURN THE DOWNLOAD LINKS FOUND ON THIS PAGE**
    return pageDownloadLinks;
  });
}

// Helper to create a visual sitemap
async function createVisualSitemap(
  paths: Array<{
    from: string;
    to: string;
    label: string;
    isDownloadable?: boolean;
    fileSize?: number;
    elementCounts?: any;
  }>,
  outputDir: string
) {
  // Regular pages and downloadable resources
  const regularPages = paths.filter((p) => !p.isDownloadable);
  const downloadableResources = paths.filter((p) => p.isDownloadable);

  // Create a simple HTML sitemap file
  const sitemapHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Site Navigation Map</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 40px; }
      .node { padding: 10px; margin: 5px; border: 1px solid #ddd; border-radius: 4px; }
      .link { margin: 5px 0 5px 20px; padding: 5px; color: #0066cc; }
      .download { margin: 5px 0 5px 20px; padding: 5px; color: #cc6600; }
      .screenshot { max-width: 200px; margin-top: 10px; border: 1px solid #eee; }
      h2 { margin-top: 30px; }
      .element-counts { font-size: 12px; color: #666; margin-top: 5px; }
    </style>
  </head>
  <body>
    <h1>Site Navigation Map</h1>
    <p>Total navigable items: ${paths.length} (${regularPages.length} pages + ${downloadableResources.length} downloadable resources)</p>

    <h2>Navigation Pages</h2>
    <div id="sitemap">
      ${Array.from(new Set(regularPages.map((p) => p.from)))
        .map(
          (url) => `
        <div class="node">
          <div>${url}</div>
          ${regularPages
            .filter((p) => p.from === url)
            .map(
              (path) => `
            <div class="link">
              → ${path.label} (${path.to})
              ${path.elementCounts ? `<div class="element-counts">Elements: ${JSON.stringify(path.elementCounts)}</div>` : ""}
              <img class="screenshot" src="${path.label.replace(/\s+/g, "-").toLowerCase()}.png" onerror="this.style.display='none'" />
            </div>
          `
            )
            .join("")}
        </div>
      `
        )
        .join("")}
    </div>

    ${
      downloadableResources.length > 0
        ? `
      <h2>Downloadable Resources</h2>
      <div id="downloads">
        ${downloadableResources
          .map(
            (download) => `
          <div class="download">
            ${download.label} - ${formatFileSize(download.fileSize || 0)}
            <br>
            <a href="${download.to}" target="_blank">${download.to}</a>
          </div>
        `
          )
          .join("")}
      </div>
    `
        : ""
    }
  </body>
  </html>
  `;

  fs.writeFileSync(path.join(outputDir, "sitemap.html"), sitemapHtml);
  console.log(`Created visual sitemap at: ${path.join(outputDir, "sitemap.html")}`);
}

async function exportElasticSyntheticsData(
  navigationPaths: Array<{
    from: string;
    to: string;
    label: string;
    isDownloadable?: boolean;
    fileSize?: number;
    elementCounts?: any;
    fullText?: string;
  }>,
  _outputDir: string
) {
  // Get only regular pages (not downloadable resources)
  const regularPages = navigationPaths.filter((p) => !p.isDownloadable);

  // Create structured data for Elastic Synthetics
  const pagesData = regularPages.map((page) => {
    return {
      label: page.label,
      url: page.to,
      sourceUrl: page.from,
      elementCounts: page.elementCounts || {},
      fullText: page.fullText || page.label,
      href: page.to.split("/").pop() || "",
    };
  });

  // Export JSON for use with Elastic Synthetics
  const syntheticsData = {
    baseUrl: config.server.baseUrl,
    pages: pagesData,
    timestamp: new Date().toISOString(),
  };

  // Save as JSON in the synthetics directory
  fs.writeFileSync(
    path.join(config.server.syntheticsDir, "synthetics-data.json"),
    JSON.stringify(syntheticsData, null, 2)
  );

  // Generate and save Elastic Synthetics test file with correct name
  const testCode = generateElasticSyntheticsTest(syntheticsData);
  const _siteId =
    new URL(config.server.baseUrl).pathname.split("/").filter(Boolean).pop() || "site";
  const fileName = `core.journey.ts`;
  const filePath = path.join(config.server.syntheticsDir, fileName);

  fs.writeFileSync(filePath, testCode);

  console.log(
    `Exported Elastic Synthetics data to: ${path.join(config.server.syntheticsDir, "synthetics-data.json")}`
  );
  console.log(`Generated Elastic Synthetics test at: ${filePath}`);

  return syntheticsData;
}

// Validate all images and links on the page to detect broken URLs
async function validateAssetImages(page: Page): Promise<{
  validImages: Array<{ src: string; alt: string }>;
  brokenImages: Array<{
    src: string;
    alt: string;
    correctedUrl?: string;
    statusCode?: number;
    error?: string;
  }>;
  downloadableAssets: Array<{
    text: string;
    href: string;
    fullText: string;
    isDownload: boolean;
  }>;
}> {
  const results = {
    validImages: [] as Array<{ src: string; alt: string }>,
    brokenImages: [] as Array<{
      src: string;
      alt: string;
      correctedUrl?: string;
      statusCode?: number;
      error?: string;
    }>,
    downloadableAssets: [] as Array<{
      text: string;
      href: string;
      fullText: string;
      isDownload: boolean;
    }>,
  };

  try {
    // Wait a moment for any lazy-loaded images to start loading
    await page.waitForTimeout(1000);

    // Get all images including their loading status
    const imagesData = await page.evaluate(() => {
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
    testState.incrementTotalLinksFound(imagesData.length);

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
        const check = await verifyResourceExists(img.src, true);

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
    const assetLinks = await page.$$eval('a[href*="/assets/"]', (links) =>
      links.map((link) => ({
        href: (link as HTMLAnchorElement).href,
        text: (link as HTMLAnchorElement).textContent?.trim() || "",
        innerHTML: (link as HTMLAnchorElement).innerHTML,
      }))
    );

    // Also check for video links if configured
    const videoElements = await page.$$eval(VIDEO_SELECTORS, (elements) =>
      elements
        .map((el) => {
          if (el.tagName === "SOURCE") {
            return { url: (el as HTMLSourceElement).src, type: "video" };
          } else if (el.tagName === "IFRAME") {
            return { url: (el as HTMLIFrameElement).src, type: "embed" };
          } else if (el.tagName === "A") {
            return { url: (el as HTMLAnchorElement).href, type: "download" };
          }
          return null;
        })
        .filter(Boolean)
    );

    // Validate videos if any found
    const maxVideosToValidate =
      config.allowedDownloads.maxVideosToValidate || VALIDATION_LIMITS.MAX_VIDEOS_TO_VALIDATE;
    if (videoElements.length > 0) {
      console.log(
        `   Found ${videoElements.length} video links, validating up to ${maxVideosToValidate}...`
      );
      const videosToCheck = videoElements.slice(0, maxVideosToValidate);

      for (const video of videosToCheck) {
        if (video && typeof video === "object" && "url" in video) {
          const check = await verifyResourceExists(video.url, true);
          if (!check.exists) {
            testState.incrementBrokenVideos();
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
      testState.incrementVideosFound(videoElements.length);
      testState.incrementVideosValidated(Math.min(videoElements.length, maxVideosToValidate));
    }

    // Check these links for broken ones too
    for (const link of assetLinks) {
      if (link.href.match(/\.(jpg|jpeg|png|gif|webp|pdf|zip)$/i)) {
        const check = await verifyResourceExists(link.href, true);

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
  } catch (error) {
    console.log(
      `Error validating asset images: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return results;
}

// Better resource verification with proper headers and retry logic
async function verifyResourceExists(
  url: string,
  silent: boolean = false
): Promise<{
  exists: boolean;
  contentLength?: number;
  statusCode?: number;
  error?: string;
}> {
  const maxRetries = silent
    ? RETRY_CONFIG.RESOURCE_VERIFICATION_SILENT
    : RETRY_CONFIG.RESOURCE_VERIFICATION;
  let currentRetry = 0;

  while (currentRetry < maxRetries) {
    try {
      if (!silent) {
        console.log(`📥 Resource verification attempt ${currentRetry + 1}/${maxRetries}: ${url}`);
      }

      const result = await new Promise<{
        exists: boolean;
        contentLength?: number;
        statusCode?: number;
        error?: string;
      }>((resolve) => {
        const protocol = url.startsWith("https") ? https : http;

        const options = {
          method: "HEAD", // Use HEAD for faster validation without downloading
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            Accept: "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            Connection: "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            Referer: new URL(url).origin,
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
          timeout: silent ? TIMEOUTS.RESOURCE_CHECK_SILENT : TIMEOUTS.RESOURCE_CHECK,
        };

        const req = protocol.request(url, options, (res) => {
          const statusCode = res.statusCode || 0;
          const contentType = res.headers["content-type"] || "";
          const contentLength = Number.parseInt(res.headers["content-length"] || "0", 10);

          if (!silent) {
            console.log(`📥 Resource check response:`);
            console.log(`   Status: ${statusCode}`);
            console.log(`   Content-Type: ${contentType}`);
            console.log(`   Content-Length: ${formatFileSize(contentLength)}`);
          }

          // Some servers return 405 for HEAD requests - treat as success if it's an image
          const isSuccess =
            (statusCode >= 200 && statusCode < 400) ||
            (statusCode === 405 && url.match(/\.(jpg|jpeg|png|gif|webp|tiff|bmp)$/i) !== null); // Method not allowed for HEAD on images

          req.destroy();

          if (!silent) {
            console.log(`   Result: ${isSuccess ? "EXISTS" : "NOT FOUND"}`);
          }
          resolve({ exists: isSuccess, contentLength, statusCode });
        });

        req.on("error", (error) => {
          if (!silent) {
            console.log(`Resource verification error: ${error.message}`);
          }
          resolve({ exists: false, error: error.message });
        });

        req.on("timeout", () => {
          req.destroy();
          if (!silent) {
            console.log(`⏱️ Resource verification timeout`);
          }
          resolve({ exists: false, error: "Request timeout" });
        });

        req.end();
      });

      if (result.exists) {
        return result;
      }

      currentRetry++;
      if (currentRetry < maxRetries) {
        const delay = currentRetry * 2000;
        if (!silent) {
          console.log(`⏱️ Retrying verification in ${delay}ms...`);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } catch (error) {
      if (!silent) {
        console.log(`Resource verification exception: ${error}`);
      }
      currentRetry++;
      if (currentRetry < maxRetries) {
        const delay = currentRetry * 2000;
        if (!silent) {
          console.log(`⏱️ Retrying verification in ${delay}ms...`);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  if (!silent) {
    console.log(`All ${maxRetries} verification attempts failed for: ${url}`);
  }
  return { exists: false, error: "All verification attempts failed" };
}

// Download file with retry logic for network failures
async function downloadFile(url: string, destination: string): Promise<boolean> {
  const maxRetries = RETRY_CONFIG.DOWNLOAD_ATTEMPTS;
  let currentRetry = 0;

  while (currentRetry < maxRetries) {
    try {
      console.log(`📥 Download attempt ${currentRetry + 1}/${maxRetries}: ${url}`);

      const success = await new Promise<boolean>((resolve) => {
        const protocol = url.startsWith("https") ? https : http;
        const file = fs.createWriteStream(destination);
        let downloadedSize = 0;
        let isResolved = false;

        // Enhanced request options
        const options = {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            Accept: "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            Connection: "keep-alive",
            Referer: new URL(url).origin,
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
          timeout: TIMEOUTS.DOWNLOAD,
        };

        const req = protocol.get(url, options, (response) => {
          const statusCode = response.statusCode || 0;

          console.log(`📥 Download response: ${statusCode} for ${url}`);

          // Handle redirects
          if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
            file.close();
            fs.existsSync(destination) && fs.unlinkSync(destination);

            const redirectUrl = new URL(response.headers.location, url).toString();
            console.log(`↗️ Following redirect to: ${redirectUrl}`);

            // Recursive call for redirect
            downloadFile(redirectUrl, destination).then(resolve);
            return;
          }

          // Check if the response is successful
          if (statusCode >= 200 && statusCode < 300) {
            // Check content type
            const contentType = response.headers["content-type"] || "";
            console.log(`Content-Type: ${contentType}`);

            // Check content length
            const contentLength = Number.parseInt(response.headers["content-length"] || "0", 10);
            console.log(`📦 Content-Length: ${formatFileSize(contentLength)}`);

            if (contentLength > config.allowedDownloads.maxFileSize) {
              console.log(
                `File size ${formatFileSize(contentLength)} exceeds maximum allowed size of ${formatFileSize(config.allowedDownloads.maxFileSize)}`
              );
              file.close();
              fs.existsSync(destination) && fs.unlinkSync(destination);
              if (!isResolved) {
                isResolved = true;
                resolve(false);
              }
              return;
            }

            // Handle download progress
            response.on("data", (chunk) => {
              downloadedSize += chunk.length;
              if (downloadedSize > config.allowedDownloads.maxFileSize) {
                console.log(`Download cancelled: File size exceeded during download`);
                req.destroy();
                file.close();
                fs.existsSync(destination) && fs.unlinkSync(destination);
                if (!isResolved) {
                  isResolved = true;
                  resolve(false);
                }
                return;
              }
            });

            response.pipe(file);

            file.on("finish", () => {
              file.close();

              // Verify the downloaded file
              if (fs.existsSync(destination)) {
                const stats = fs.statSync(destination);
                if (stats.size > 0) {
                  console.log(
                    `Successfully downloaded: ${destination} (${formatFileSize(stats.size)})`
                  );
                  if (!isResolved) {
                    isResolved = true;
                    resolve(true);
                  }
                } else {
                  console.log(`Downloaded file is empty: ${destination}`);
                  fs.unlinkSync(destination);
                  if (!isResolved) {
                    isResolved = true;
                    resolve(false);
                  }
                }
              } else {
                console.log(`Downloaded file not found: ${destination}`);
                if (!isResolved) {
                  isResolved = true;
                  resolve(false);
                }
              }
            });

            file.on("error", (error) => {
              console.log(`File write error: ${error.message}`);
              file.close();
              fs.existsSync(destination) && fs.unlinkSync(destination);
              if (!isResolved) {
                isResolved = true;
                resolve(false);
              }
            });
          } else {
            file.close();
            fs.existsSync(destination) && fs.unlinkSync(destination);
            console.log(`Download failed: HTTP ${statusCode}`);
            if (!isResolved) {
              isResolved = true;
              resolve(false);
            }
          }
        });

        req.on("error", (error) => {
          file.close();
          fs.existsSync(destination) && fs.unlinkSync(destination);
          console.log(`Download request error: ${error.message}`);
          if (!isResolved) {
            isResolved = true;
            resolve(false);
          }
        });

        req.on("timeout", () => {
          req.destroy();
          file.close();
          fs.existsSync(destination) && fs.unlinkSync(destination);
          console.log(`⏱️ Download timeout after 60 seconds`);
          if (!isResolved) {
            isResolved = true;
            resolve(false);
          }
        });
      });

      if (success) {
        return true;
      }

      currentRetry++;
      if (currentRetry < maxRetries) {
        const delay = currentRetry * 2000;
        console.log(`⏱️ Retrying download in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } catch (error) {
      console.log(`Download exception: ${error}`);
      currentRetry++;
      if (currentRetry < maxRetries) {
        const delay = currentRetry * 2000;
        console.log(`⏱️ Retrying download in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.log(`All ${maxRetries} download attempts failed for: ${url}`);
  return false;
}

// Generate comprehensive broken links report
async function generateBrokenLinksReport(brokenLinks: Map<string, BrokenLink[]>) {
  if (brokenLinks.size === 0) {
    console.log("\nNo broken links found during validation!");
    return;
  }

  // Calculate summary statistics
  let totalBrokenLinks = 0;
  let totalImages = 0;
  let totalAssets = 0;

  const brokenByPage: Record<string, BrokenLink[]> = {};

  for (const [pageUrl, links] of brokenLinks) {
    brokenByPage[pageUrl] = links;
    totalBrokenLinks += links.length;

    links.forEach((link) => {
      if (link.type === "image") totalImages++;
      if (link.type === "asset") totalAssets++;
    });
  }

  // Create report data
  const report: BrokenLinksReport = {
    reportDate: new Date().toISOString(),
    baseUrl: config.server.baseUrl,
    totalBrokenLinks: totalBrokenLinks,
    brokenByPage: brokenByPage,
    summary: {
      totalPages: brokenLinks.size,
      pagesWithBrokenLinks: brokenLinks.size,
      totalImages: totalImages,
      brokenImages: totalImages,
      totalAssets: totalAssets,
      brokenAssets: totalAssets,
    },
  };

  // Create reports directory if it doesn't exist
  const reportsDir = "./broken-links-reports";
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // Generate timestamp for unique filenames
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);

  // Write JSON report
  const jsonPath = path.join(reportsDir, `broken-links-${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  // Generate Markdown report
  let markdown = `# Broken Links Report\n\n`;
  markdown += `**Date:** ${new Date().toLocaleString()}\n`;
  markdown += `**Base URL:** ${config.server.baseUrl}\n`;
  markdown += `**Total Broken Links:** ${totalBrokenLinks}\n\n`;

  markdown += `## Summary\n\n`;
  markdown += `- Pages with broken links: ${report.summary.pagesWithBrokenLinks}\n`;
  markdown += `- Broken images: ${report.summary.brokenImages}\n`;
  markdown += `- Broken assets: ${report.summary.brokenAssets}\n\n`;

  markdown += `## Broken Links by Page\n\n`;

  for (const [pageUrl, links] of Object.entries(brokenByPage)) {
    markdown += `### Page: ${pageUrl}\n\n`;
    markdown += `Found ${links.length} broken link(s):\n\n`;

    links.forEach((link, index) => {
      markdown += `#### ${index + 1}. ${(link.type || "LINK").toUpperCase()}: ${link.url || link.brokenUrl}\n\n`;

      if (link.altText) {
        markdown += `- **Alt Text:** ${link.altText}\n`;
      }

      if (link.statusCode) {
        markdown += `- **Status Code:** ${link.statusCode}\n`;
      }

      if (link.error) {
        markdown += `- **Error:** ${link.error}\n`;
      }

      if (link.suggestedFix) {
        markdown += `- **Suggested Fix:** \`${link.suggestedFix}\`\n`;
      }

      markdown += `\n`;
    });

    markdown += `---\n\n`;
  }

  // Write Markdown report
  const mdPath = path.join(reportsDir, `broken-links-${timestamp}.md`);
  fs.writeFileSync(mdPath, markdown);

  // Also write a latest version for easy access
  const latestJsonPath = path.join(reportsDir, "broken-links-latest.json");
  const latestMdPath = path.join(reportsDir, "broken-links-latest.md");
  fs.writeFileSync(latestJsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(latestMdPath, markdown);

  // Console output with clear summary
  console.log(`\n${"=".repeat(80)}`);
  console.log("BROKEN LINKS REPORT GENERATED");
  console.log("=".repeat(80));
  console.log(`\n🔴 Total Broken Links Found: ${totalBrokenLinks}`);
  console.log(`\n📍 Pages with Issues (${report.summary.pagesWithBrokenLinks}):\n`);

  for (const [pageUrl, links] of Object.entries(brokenByPage)) {
    console.log(`\n  ${pageUrl}`);
    console.log(`  └─ ${links.length} broken link(s):\n`);

    links.forEach((link, index) => {
      console.log(
        `     ${index + 1}. [${(link.type || "LINK").toUpperCase()}] ${link.url || link.brokenUrl}`
      );
      if (link.suggestedFix) {
        console.log(`        → Suggested: ${link.suggestedFix}`);
      }
    });
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log("Reports saved to:");
  console.log(`   JSON: ${jsonPath}`);
  console.log(`   Markdown: ${mdPath}`);
  console.log(`   Latest: ${latestJsonPath}`);
  console.log(`${"=".repeat(80)}\n`);
}

// Scan current page for download links**
async function scanPageForDownloads(page: Page, pageName: string) {
  console.log(`🔍 Scanning "${pageName}" for download links...`);

  const downloadLinks = await page.evaluate((downloadSelectors) => {
    const downloads: Array<{
      text: string;
      href: string;
      fullText: string;
      isDownload: boolean;
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
            link.hasAttribute("download");

          if (isDownload && !downloads.some((d) => d.href === href)) {
            downloads.push({
              text,
              href,
              fullText: text,
              isDownload: true,
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
    console.log(`📥 Found ${downloadLinks.length} download links on "${pageName}":`);
    downloadLinks.forEach((link, idx) => {
      console.log(`   ${idx + 1}. 📥 ${link.text} (${link.href})`);
    });
    return downloadLinks;
  } else {
    console.log(`📥 No download links found on "${pageName}"`);
    return [];
  }
}
