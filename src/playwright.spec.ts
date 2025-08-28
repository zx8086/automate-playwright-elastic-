/* src/test.spec.ts */

import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as https from "https";
import { config } from "../config";
import { z } from "zod";

// Zod v4 schemas with enhanced validation and metadata
const ElementCountsSchema = z
  .object({
    images: z.number().int().nonnegative().describe("Number of images found"),
    paragraphs: z
      .number()
      .int()
      .nonnegative()
      .describe("Number of paragraphs found"),
    headings: z
      .number()
      .int()
      .nonnegative()
      .describe("Number of headings found"),
    links: z.number().int().nonnegative().describe("Number of links found"),
    buttons: z.number().int().nonnegative().describe("Number of buttons found"),
  })
  .describe("Page element counts for analytics");

// Zod v4 feature: Enhanced error reporting for broken links
const BrokenLinkSchema = z
  .object({
    url: z.string().url().or(z.string()),
    pageFound: z.string(),
    type: z.enum(["image", "asset", "download"]),
    altText: z.string().optional(),
    suggestedFix: z.string().optional(),
    statusCode: z.number().int().min(100).max(599).optional(),
    error: z.string().max(500).optional(),
  })
  .describe("Broken link information");

// Zod v4 feature: Nested validation with cross-field checks
const BrokenLinksReportSchema = z
  .object({
    reportDate: z.string().datetime({ offset: true }),
    baseUrl: z.string().url(),
    totalBrokenLinks: z.number().int().nonnegative(),
    brokenByPage: z.record(z.string(), z.array(BrokenLinkSchema)),
    summary: z.object({
      totalPages: z.number().int().nonnegative(),
      pagesWithBrokenLinks: z.number().int().nonnegative(),
      totalImages: z.number().int().nonnegative(),
      brokenImages: z.number().int().nonnegative(),
      totalAssets: z.number().int().nonnegative(),
      brokenAssets: z.number().int().nonnegative(),
    }),
  })
  .refine(
    (data) => data.summary.pagesWithBrokenLinks <= data.summary.totalPages,
    { message: "Pages with broken links cannot exceed total pages" },
  )
  .describe("Complete broken links report");

type BrokenLink = z.infer<typeof BrokenLinkSchema>;
type BrokenLinksReport = z.infer<typeof BrokenLinksReportSchema>;

// Zod v4 feature: Advanced navigation path validation
const NavigationPathSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    label: z.string().min(1).max(200),
    isDownloadable: z.boolean().default(false),
    fileSize: z.number().int().positive().optional(),
    elementCounts: ElementCountsSchema.optional(),
    fullText: z.string().max(1000).optional(),
    skippedReason: z.string().max(500).optional(),
  })
  .describe("Navigation path between pages");

// Zod v4 feature: Skipped download tracking with validation
const SkippedDownloadSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    label: z.string().min(1).max(200),
    fileSize: z.number().int().positive().optional(),
    reason: z.string().min(1).max(500),
  })
  .describe("Information about skipped downloads");

// Zod v4 feature: Page load options with sensible defaults
const PageLoadOptionsSchema = z
  .object({
    timeout: z.number().int().min(1000).max(60000).default(30000),
    imageTimeout: z.number().int().min(1000).max(30000).default(10000),
    networkIdleTimeout: z.number().int().min(500).max(10000).default(3000),
  })
  .describe("Page load timeout configuration");

// Zod v4 feature: Performance metrics with proper typing
const PerformanceMetricsSchema = z
  .object({
    navigationTiming: z.any().describe("PerformanceNavigationTiming object"),
    paintTiming: z.array(z.any()).describe("Array of PerformancePaintTiming"),
    lcp: z.any().optional().describe("Largest Contentful Paint entry"),
    cls: z.any().optional().describe("Cumulative Layout Shift entry"),
    longTasks: z
      .array(z.any())
      .optional()
      .describe("Array of long task entries"),
  })
  .describe("Web performance metrics");

// Type inference from schemas
type ElementCounts = z.infer<typeof ElementCountsSchema>;
type NavigationPath = z.infer<typeof NavigationPathSchema>;
type SkippedDownload = z.infer<typeof SkippedDownloadSchema>;
type PageLoadOptions = z.infer<typeof PageLoadOptionsSchema>;
type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;

const logMemoryUsage = () => {
  const memUsage = process.memoryUsage();
  console.log("Memory Usage:", {
    rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
    external: `${Math.round(memUsage.external / 1024 / 1024)} MB`,
  });
};

// Global broken links collector
const globalBrokenLinks: Map<string, BrokenLink[]> = new Map();
// Track total links validated across all pages
let globalValidatedLinksCount = 0;
let globalWorkingLinksCount = 0;
let globalTotalLinksFound = 0;
// Track video validation separately
let globalVideosFound = 0;
let globalVideosValidated = 0;
let globalBrokenVideos = 0;

test.describe("Site Navigation Test with Steps", () => {
  test.setTimeout(180000); // 3 minutes

  test.beforeAll(async () => {
    // console.log('\nInitial Memory Usage:');
    // logMemoryUsage();
    globalBrokenLinks.clear();

    // Clean up all output directories from previous runs
    const directoriesToClean = [
      { path: config.server.screenshotDir, name: "Screenshots" },
      { path: config.server.downloadsDir, name: "Downloads" },
      { path: config.server.syntheticsDir, name: "Synthetics" },
      { path: "./broken-links-reports", name: "Broken Links Reports" },
    ];

    console.log("🧹 Cleaning up previous run artifacts...");
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
            console.log(`✨ ${dir.name}: already clean`);
          }
        } else {
          console.log(`📁 ${dir.name}: directory doesn't exist yet`);
        }
      } catch (error) {
        console.log(`⚠️ Failed to clean up ${dir.name}: ${error.message}`);
      }
    }

    console.log(
      `✅ Cleanup complete: ${totalFilesCleanedUp} total file(s) removed\n`,
    );
  });

  test.afterAll(async () => {
    // console.log('\nFinal Memory Usage:');
    // logMemoryUsage();

    // Generate broken links report
    if (globalBrokenLinks.size > 0) {
      await generateBrokenLinksReport(globalBrokenLinks);
    }
  });

  test.beforeEach(async ({ page }) => {
    [
      config.server.screenshotDir,
      config.server.downloadsDir,
      config.server.syntheticsDir,
    ].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Set desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Navigate to site
    await page.goto(config.server.baseUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
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
      const downloadIcon = item.isDownload ? "📥" : "🔗";
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
        if (isDownloadableResource(item.href)) {
          try {
            console.log(`📥 Handling downloadable resource: ${item.text}`);

            // Skip if we've already processed this download
            if (processedDownloads.has(absoluteUrl)) {
              console.log(
                `⏭️ Skipping already processed download: ${absoluteUrl}`,
              );
              return;
            }

            // Verify the resource exists and get content length
            const { exists, contentLength } =
              await verifyResourceExists(absoluteUrl);

            if (exists) {
              console.log(`✅ Resource ${item.text} exists and is accessible`);

              // Try to download the file
              const downloadPath = path.join(
                config.server.downloadsDir,
                path.basename(item.href),
              );

              if (
                contentLength &&
                contentLength > config.allowedDownloads.maxFileSize
              ) {
                console.log(
                  `⚠️ File size ${formatFileSize(contentLength)} exceeds maximum allowed size of ${formatFileSize(config.allowedDownloads.maxFileSize)}`,
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
                const downloadSuccessful = await downloadFile(
                  absoluteUrl,
                  downloadPath,
                );

                if (downloadSuccessful) {
                  console.log(`✅ Successfully downloaded: ${downloadPath}`);

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
                  console.log(`⚠️ Download failed for: ${absoluteUrl}`);
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
              console.log(`⚠️ Resource not accessible: ${absoluteUrl}`);
            }
          } catch (error: unknown) {
            console.log(
              `⚠️ Error handling downloadable resource: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        // Handle regular page navigation
        else {
          try {
            // For regular pages, navigate directly to the URL instead of clicking
            console.log(`🔗 Direct navigation to: ${absoluteUrl}`);
            await page.goto(absoluteUrl, { timeout: 30000 });

            // Wait for the page to load
            await page.waitForLoadState("domcontentloaded");
            await page.waitForTimeout(config.server.pauseBetweenClicks);

            // Verify navigation was successful
            const currentUrl = page.url();
            if (currentUrl !== startUrl) {
              console.log(`✅ Successfully navigated to: ${currentUrl}`);

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
                  `${item.text.replace(/\s+/g, "-").toLowerCase()}.png`,
                ),
              });

              // Check for unique elements on this page
              const pageDownloadLinks = await checkPageSpecificElements(
                page,
                item.text,
              );

              // Process any download links found on this page
              if (pageDownloadLinks && pageDownloadLinks.length > 0) {
                for (const downloadLink of pageDownloadLinks) {
                  const downloadUrl = new URL(
                    downloadLink.href,
                    currentUrl,
                  ).toString();

                  // Skip if we've already processed this download
                  if (processedDownloads.has(downloadUrl)) {
                    console.log(
                      `⏭️ Skipping already processed download: ${downloadUrl}`,
                    );
                    continue;
                  }

                  console.log(
                    `📥 Processing download found on "${item.text}": ${downloadLink.text} (${downloadLink.href})`,
                  );
                  try {
                    // Verify the resource exists
                    const { exists, contentLength } =
                      await verifyResourceExists(downloadUrl);
                    if (exists) {
                      console.log(
                        `✅ Download resource ${downloadLink.text} exists and is accessible`,
                      );
                      // Try to download the file
                      const downloadPath = path.join(
                        config.server.downloadsDir,
                        path.basename(downloadLink.href),
                      );
                      const downloadSuccessful = await downloadFile(
                        downloadUrl,
                        downloadPath,
                      );
                      if (downloadSuccessful) {
                        console.log(
                          `✅ Successfully downloaded from page: ${downloadPath}`,
                        );
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
                        console.log(`⚠️ Download failed for: ${downloadUrl}`);
                        if (
                          contentLength &&
                          contentLength > config.allowedDownloads.maxFileSize
                        ) {
                          console.log(
                            `⚠️ File size ${formatFileSize(contentLength)} exceeds maximum allowed size of ${formatFileSize(config.allowedDownloads.maxFileSize)}`,
                          );
                          fs.existsSync(downloadPath) &&
                            fs.unlinkSync(downloadPath);
                          const skippedDownload: SkippedDownload = {
                            from: startUrl,
                            to: downloadUrl,
                            label: downloadLink.text
                              .replace(/\s+/g, " ")
                              .trim(),
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
                            label: downloadLink.text
                              .replace(/\s+/g, " ")
                              .trim(),
                            fileSize: contentLength,
                            reason: "Download failed",
                          };
                          // Validate before adding
                          SkippedDownloadSchema.parse(skippedDownload);
                          skippedDownloads.push(skippedDownload);
                        }
                      }
                    } else {
                      console.log(
                        `⚠️ Download resource not accessible: ${downloadUrl}`,
                      );
                    }
                  } catch (error) {
                    console.log(
                      `⚠️ Error handling page download: ${error instanceof Error ? error.message : String(error)}`,
                    );
                  }
                }
              }

              // Return to the main page for the next navigation
              await page.goto(config.server.baseUrl, { timeout: 30000 });
              await page.waitForLoadState("domcontentloaded");
              await page.waitForTimeout(config.server.pauseBetweenClicks);
            } else {
              console.log(`⚠️ Navigation to "${item.text}" didn't change URL`);
            }
          } catch (error: unknown) {
            console.log(
              `⚠️ Error navigating to "${item.text}": ${error instanceof Error ? error.message : String(error)}`,
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
      const downloadableResources = navigationPaths.filter(
        (p) => p.isDownloadable,
      );

      console.log(
        `Total visited: ${navigationPaths.length} (${regularPages.length} pages + ${downloadableResources.length} downloadable resources)`,
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
          console.log(
            `${index + 1}. ${cleanLabel}: ${formatFileSize(path.fileSize || 0)}`,
          );
        });
      }

      // Count working asset links (from successful downloads)
      const workingAssetCount = processedDownloads.size;

      // Add broken links summary if any were found
      if (globalBrokenLinks.size > 0) {
        let totalBroken = 0;
        for (const links of globalBrokenLinks.values()) {
          totalBroken += links.length;
        }

        console.log("\n- Broken Links Found:");
        console.log(
          `  ❌ Total: ${totalBroken} broken link(s) detected out of ${globalValidatedLinksCount} tested`,
        );

        for (const [pageUrl, links] of globalBrokenLinks) {
          const pageName = pageUrl.split("/").filter(Boolean).pop() || "home";
          console.log(`  - ${pageName} page: ${links.length} broken link(s)`);
        }
        console.log(
          "\n  ⚠️  See broken-links-reports/ directory for detailed report",
        );
      } else {
        console.log("\n- Link Validation:");

        // Show total links validated including images, videos and downloads
        const totalValidated =
          globalValidatedLinksCount + globalVideosValidated + workingAssetCount;
        const totalFound =
          globalTotalLinksFound + globalVideosFound + workingAssetCount;

        if (totalValidated > 0) {
          console.log(`  ✅ All links are working correctly`);

          // Show total found vs validated
          if (totalFound > totalValidated) {
            console.log(
              `  📊 Successfully validated ${totalValidated} link(s) out of ${totalFound} found:`,
            );
          } else {
            console.log(
              `  📊 Successfully validated ${totalValidated} link(s):`,
            );
          }

          if (globalValidatedLinksCount > 0) {
            if (globalTotalLinksFound > globalValidatedLinksCount) {
              console.log(
                `     - Asset images: ${globalValidatedLinksCount} validated (${globalTotalLinksFound} total found)`,
              );
            } else {
              console.log(`     - Asset images: ${globalValidatedLinksCount}`);
            }
          }
          if (globalVideosValidated > 0) {
            if (globalVideosFound > globalVideosValidated) {
              console.log(
                `     - Videos: ${globalVideosValidated} validated (${globalVideosFound} total found)`,
              );
            } else {
              console.log(`     - Videos: ${globalVideosValidated}`);
            }
          }
          if (workingAssetCount > 0) {
            console.log(`     - Downloadable files: ${workingAssetCount}`);
          }
        } else {
          console.log("  ✅ All links are working correctly");
        }
      }

      // NEW: List skipped downloads
      if (skippedDownloads && skippedDownloads.length > 0) {
        console.log("\n- Skipped Downloads:");
        skippedDownloads.forEach((item, index) => {
          const cleanLabel = item.label.replace(/\s+/g, " ").trim();
          const sizeStr = item.fileSize
            ? formatFileSize(item.fileSize)
            : "Unknown size";
          const reason = item.reason || "Download failed";
          console.log(
            `${index + 1}. ${cleanLabel}: ${sizeStr} [SKIPPED: ${reason}]`,
          );
        });
      }

      // Export data for Elastic Synthetics
      await exportElasticSyntheticsData(
        navigationPaths,
        config.server.syntheticsDir,
      );

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

  const navItems = await page.evaluate(() => {
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

    // ENHANCED: More comprehensive selectors for all press kit types
    const navSelectors = [
      // Standard navigation
      "nav a",
      "header a",
      ".menu a",
      ".navbar a",
      ".navigation a",
      '[role="navigation"] a',
      ".main-menu a",
      ".site-nav a",

      // Press kit specific selectors
      ".press-kit-nav a",
      ".presskit-nav a",
      ".pk-nav a",

      // Tommy Hilfiger specific patterns
      'a[href*=".html"]', // Page links
      'a[href*=".pdf"]', // PDF downloads
      'a[href*=".zip"]', // ZIP downloads
      'a[href*="/assets/"]', // Asset downloads
      'a[href*="/files/"]', // File downloads
      'a[href*="download"]', // Download links
      'a[href*="product.zip"]', // Specific product ZIP
      'a[href*="stills.zip"]', // Stills ZIP
      'a[href*="images.zip"]', // Images ZIP

      // Generic content links
      "main a",
      ".content a",
      ".container a",

      // Footer links (often contain downloads)
      "footer a",
    ];

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

        // **FIXED: Better download detection that handles assets pages correctly**
        const extension = href.split(".").pop()?.toLowerCase() || "";
        const hasFileExtension = [
          "pdf",
          "zip",
          "rar",
          "7z",
          "doc",
          "docx",
          "xls",
          "xlsx",
          "csv",
          "txt",
          "jpg",
          "jpeg",
          "png",
          "gif",
          "webp",
          "svg",
          "mp4",
          "mov",
          "avi",
          "wmv",
          "mp3",
          "wav",
          "psd",
          "ai",
          "eps",
          "indd",
        ].includes(extension);

        // **NEW: Smart assets directory detection**
        const isAssetsDirectory =
          (href.endsWith("/assets/") || href.endsWith("/assets")) &&
          !hasFileExtension; // No file extension = directory, not file

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

        // **ENHANCED: Proper download detection**
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
          // **NEW: Allow assets.zip, asset.zip but not /assets/ directories**
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

    // ENHANCED: Special handling for hidden download links
    const potentialDownloads = document.querySelectorAll(
      "[data-download], [data-file], .download-link, .download-btn",
    );
    for (const element of potentialDownloads) {
      const href =
        element.getAttribute("href") ||
        element.getAttribute("data-href") ||
        element.getAttribute("data-url");

      if (href) {
        const text = element.textContent?.trim() || "Download";
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

    console.log(
      `Found ${items.length} navigation items with enhanced detection`,
    );
    return items;
  });

  // Rest of the function remains the same...
  if (navItems.length === 0) {
    console.log(
      "⚠️ No navigation items found with enhanced selectors, trying comprehensive fallback...",
    );

    // Your existing fallback logic here...
  }

  console.log(`Enhanced navigation detection found ${navItems.length} items`);
  return navItems;
}

// ENHANCED: Better page-specific element checking with improved scrolling
async function checkPageSpecificElements(
  page: Page,
  pageName: string,
): Promise<
  Array<{ text: string; href: string; fullText: string; isDownload: boolean }>
> {
  return await test.step(`Check ${pageName} page elements`, async () => {
    // ENHANCED: Better scrolling for lazy loading (especially for asset pages)
    await page.evaluate(async () => {
      const scrollToBottomEnhanced = async () => {
        const scrollHeight = document.documentElement.scrollHeight;
        const viewportHeight = window.innerHeight;
        const totalSteps = Math.ceil(scrollHeight / viewportHeight);

        console.log(
          `📜 Starting enhanced scroll: ${totalSteps} steps for lazy loading`,
        );

        for (let step = 0; step < totalSteps; step++) {
          const scrollTo = step * viewportHeight;
          window.scrollTo({ top: scrollTo, behavior: "smooth" });

          // Wait longer for lazy loading to trigger
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Check for new images that might have loaded
          const newImages = document.querySelectorAll(
            'img[loading="lazy"], img[data-src], img[src*="nextImageExportOptimizer"]',
          );
          if (newImages.length > 0) {
            console.log(
              `📸 Found ${newImages.length} lazy images at scroll position ${scrollTo}`,
            );
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
    console.log(
      `📊 Page "${pageName}" contains: ${JSON.stringify(elementCounts)}`,
    );

    // ENHANCED: More comprehensive page-specific checks
    const pageNameLower = pageName.toLowerCase();

    if (
      pageNameLower.includes("bio") ||
      pageNameLower.includes("about") ||
      pageNameLower.includes("tommy")
    ) {
      const bioElements = await page
        .locator("article, .bio, .biography, .about, .profile")
        .count();
      const textBlocks = await page.locator("p, .text, .content").count();
      console.log(
        `👤 Biography page elements: ${bioElements} bio sections, ${textBlocks} text blocks`,
      );
    } else if (pageNameLower.includes("contact")) {
      const contactElements = await page
        .locator('form, [type="email"], [type="tel"], address, .contact')
        .count();
      const socialLinks = await page
        .locator(
          'a[href*="instagram"], a[href*="twitter"], a[href*="facebook"]',
        )
        .count();
      console.log(
        `📞 Contact page elements: ${contactElements} contact forms, ${socialLinks} social links`,
      );
    } else if (
      pageNameLower.includes("asset") ||
      pageNameLower.includes("image") ||
      pageNameLower.includes("media") ||
      pageNameLower.includes("gallery") ||
      pageNameLower.includes("stills")
    ) {
      const galleryElements = await page
        .locator(".gallery, .grid, .assets, .media-grid")
        .count();
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
          'img[src*="7016w"], img[src*="3360w"], img[src*="_high"], img[src*="_large"], img[src*="nextImageExportOptimizer"]',
        )
        .count();
      console.log(`   - High-res/optimized images: ${hiResImages}`);

      // NEW: Validate individual asset images on asset pages if enabled
      if (config.allowedDownloads.validateAssetImages) {
        console.log(`\n🔍 Validating individual asset images...`);
        const assetImages = await validateAssetImages(page);

        // Collect broken links for global report
        const pageUrl = page.url();
        const pageBrokenLinks: BrokenLink[] = [];

        if (assetImages.brokenImages.length > 0) {
          console.log(
            `\n❌ Found ${assetImages.brokenImages.length} broken links:`,
          );
          assetImages.brokenImages.forEach((img, index) => {
            console.log(`   ${index + 1}. ${img.src}`);
            if (img.statusCode) {
              console.log(`      Status: ${img.statusCode}`);
            }

            // Add to broken links collection
            pageBrokenLinks.push({
              url: img.src,
              pageFound: pageUrl,
              type: "image",
              altText: img.alt || undefined,
              suggestedFix: img.correctedUrl,
              statusCode: img.statusCode,
              error: img.error,
            });
          });

          // Store broken links for this page
          if (pageBrokenLinks.length > 0) {
            globalBrokenLinks.set(pageUrl, pageBrokenLinks);
          }

          // Create a summary report
          const brokenReport = {
            pageUrl: page.url(),
            totalImages:
              assetImages.validImages.length + assetImages.brokenImages.length,
            brokenCount: assetImages.brokenImages.length,
            validCount: assetImages.validImages.length,
          };

          console.log(`\n📊 Link validation summary for ${pageName}:`);
          console.log(`   Total links checked: ${brokenReport.totalImages}`);
          console.log(`   ✅ Valid: ${brokenReport.validCount}`);
          console.log(`   ❌ BROKEN: ${brokenReport.brokenCount}`);
        } else if (assetImages.validImages.length > 0) {
          console.log(
            `✅ All ${assetImages.validImages.length} asset images are valid and accessible`,
          );
        }

        // Track total validated links globally
        const totalValidatedOnPage =
          assetImages.validImages.length + assetImages.brokenImages.length;
        globalValidatedLinksCount += totalValidatedOnPage;
        globalWorkingLinksCount += assetImages.validImages.length;

        // Don't download anything - we're only checking for broken links
        // Return empty array since we're not downloading broken assets
        return [];
      }

      // Return empty array if validation is disabled
      return [];
    } else if (
      pageNameLower.includes("press") ||
      pageNameLower.includes("release")
    ) {
      const pressElements = await page
        .locator(".press, .release, .news, article")
        .count();
      const pdfLinks = await page.locator('a[href*=".pdf"]').count();
      console.log(
        `📰 Press page elements: ${pressElements} press sections, ${pdfLinks} PDF downloads`,
      );
    } else if (pageNameLower.includes("video")) {
      const videoElements = await page
        .locator('video, iframe[src*="youtube"], iframe[src*="vimeo"], .video')
        .count();
      const videoDownloads = await page
        .locator('a[href*=".mp4"], a[href*=".mov"]')
        .count();
      console.log(
        `🎥 Video page elements: ${videoElements} video players, ${videoDownloads} video downloads`,
      );
    } else if (pageNameLower.includes("aleali")) {
      const profileElements = await page
        .locator(".profile, .bio, .about, article")
        .count();
      const imageElements = await page.locator("img").count();
      console.log(
        `👩 Aleali May page elements: ${profileElements} profile sections, ${imageElements} images`,
      );
    }

    // Check for missing critical elements
    const hasMissingElements = await page.evaluate(() => {
      const criticalSelectors = ["h1", "main", ".content", ".container"];
      const missingElements = criticalSelectors.filter(
        (selector) => document.querySelectorAll(selector).length === 0,
      );
      return missingElements;
    });

    if (hasMissingElements.length > 0) {
      console.log(
        `⚠️ Missing critical elements: ${hasMissingElements.join(", ")}`,
      );
    }

    // **NEW: SCAN FOR DOWNLOAD LINKS ON THIS PAGE**
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
  outputDir: string,
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
          `,
            )
            .join("")}
        </div>
      `,
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
            📄 ${download.label} - ${formatFileSize(download.fileSize || 0)}
            <br>
            <a href="${download.to}" target="_blank">${download.to}</a>
          </div>
        `,
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
  console.log(
    `Created visual sitemap at: ${path.join(outputDir, "sitemap.html")}`,
  );
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
  outputDir: string,
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
    JSON.stringify(syntheticsData, null, 2),
  );

  // Generate and save Elastic Synthetics test file with correct name
  const testCode = generateElasticSyntheticsTest(syntheticsData);
  const siteId =
    new URL(config.server.baseUrl).pathname.split("/").filter(Boolean).pop() ||
    "site";
  const fileName = `core.journey.ts`;
  const filePath = path.join(config.server.syntheticsDir, fileName);

  fs.writeFileSync(filePath, testCode);

  console.log(
    `Exported Elastic Synthetics data to: ${path.join(config.server.syntheticsDir, "synthetics-data.json")}`,
  );
  console.log(`Generated Elastic Synthetics test at: ${filePath}`);

  return syntheticsData;
}

function generateElasticSyntheticsTest(data: {
  baseUrl: string;
  pages: Array<{
    label: string;
    url: string;
    sourceUrl: string;
    elementCounts: Record<string, number>;
    fullText?: string;
    href: string;
  }>;
  timestamp: string;
}): string {
  // Extract site identifier from the baseUrl
  const urlPath = new URL(data.baseUrl).pathname;
  const siteId = urlPath.split("/").filter(Boolean).pop() || "site";

  // Generate tags array
  const tags = [
    config.server.environment,
    config.server.department,
    config.server.domain,
    config.server.service,
    siteId,
  ].filter(Boolean);

  // Format monitor name according to convention
  const monitorName = `${config.server.departmentShort} - ${config.server.journeyType} Journey | ${siteId} (core) - prd`;

  // Format monitor ID
  const monitorId = `${config.server.journeyType}_${siteId.replace(/[^a-zA-Z0-9]/g, "_")}`;

  // Start building the enhanced test code
  let code = `/* ${config.server.domain}/${config.server.service}/${siteId}/core.journey.ts */

import {journey, monitor, step} from '@elastic/synthetics';

// TypeScript interfaces for type validation
interface PageLoadOptions {
  timeout?: number;
  imageTimeout?: number;
  networkIdleTimeout?: number;
}

interface PerformanceMetrics {
  navigationTiming?: any;
  paintTiming?: any[];
  lcp?: any;
  cls?: any;
  longTasks?: any[];
}

journey('${monitorName}', async ({ page }) => {
    monitor.use({
        id: '${monitorId}',
        schedule: 30,
        screenshot: 'on',
        throttling: false,
        tags: ${JSON.stringify(tags)}
    });

    const baseUrl = '${data.baseUrl}';

    // Update the waitForFullPageLoad function with performance metrics
    const waitForFullPageLoad = async (pageType = 'default', options: PageLoadOptions = {}) => {
        // Apply default values and basic validation
        const timeout = Math.min(Math.max(options.timeout || 10000, 1000), 60000);
        const imageTimeout = Math.min(Math.max(options.imageTimeout || 3000, 1000), 30000);
        const networkIdleTimeout = Math.min(Math.max(options.networkIdleTimeout || 1000, 500), 10000);

        const startTime = Date.now();
        console.log(\`🔄 Enhanced page load starting for \${pageType}...\`);

        try {
            // STEP 1: Essential DOM loading (CRITICAL)
            await Promise.race([
                page.waitForLoadState('domcontentloaded', { timeout: 5000 }),
                page.waitForTimeout(5000)
            ]);
            console.log(\`✅ DOM ready: \${Date.now() - startTime}ms\`);

            // STEP 2: Wait for body visibility and content (PREVENTS BLANK SCREENSHOTS)
            await Promise.race([
                page.waitForSelector('body', { state: 'visible', timeout: 3000 }),
                page.waitForTimeout(3000)
            ]);

            // Enhanced content verification with retry logic
            let hasContent = false;
            let retryCount = 0;
            const maxRetries = 3;

            while (!hasContent && retryCount < maxRetries) {
                hasContent = await page.evaluate(() => {
                    const body = document.body;
                    // More lenient content check
                    return body && (
                        body.textContent?.trim().length > 0 ||
                        body.children.length > 0 ||
                        body.innerHTML.length > 0
                    );
                });

                if (!hasContent) {
                    retryCount++;
                    if (retryCount < maxRetries) {
                        console.log(\`⚠️ Content check attempt \${retryCount} failed, retrying...\`);
                        await page.waitForTimeout(1000); // Wait before retry
                    }
                }
            }

            if (!hasContent) {
                // Check if we're in a back navigation state
                const isBackNavigation = await page.evaluate(() => {
                    return window.performance.navigation.type === 2 || // Back/Forward navigation
                           window.performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
                });

                if (isBackNavigation) {
                    console.log('⚠️ Back navigation detected, proceeding with reduced content check');
                    // For back navigation, we'll proceed even with minimal content
                    hasContent = true;
                } else {
                    throw new Error('Page appears to be empty after multiple retries');
                }
            }

            console.log(\`✅ Body visible with content: \${Date.now() - startTime}ms\`);

            // STEP 3: CRITICAL IMAGE LOADING (OPTIMIZED)
            const imagesLoaded = await waitForCriticalImages(imageTimeout);
            if (!imagesLoaded) {
                console.log('⚠️ Some images may not be fully loaded');
            }

            // STEP 4: Navigation elements (OPTIMIZED)
            const navigationLoaded = await waitForNavigation();
            if (!navigationLoaded) {
                console.log('⚠️ Navigation elements may not be fully loaded');
            }

            // STEP 5: Network stability check (OPTIMIZED)
            try {
                await Promise.race([
                    page.waitForLoadState('networkidle', { timeout: networkIdleTimeout }),
                    page.waitForTimeout(networkIdleTimeout)
                ]);
                console.log(\`✅ Network stable: \${Date.now() - startTime}ms\`);
            } catch (e) {
                console.log('⚠️ Network still active, continuing...');
            }

            // STEP 6: Final page load verification
            const pageLoadStatus = await page.evaluate(() => {
                // Check if page is interactive
                const isInteractive = document.readyState === 'complete' ||
                                    document.readyState === 'interactive';

                // Check for any loading indicators
                const loadingIndicators = document.querySelectorAll('.loading, .spinner, [aria-busy="true"]');
                const isLoading = loadingIndicators.length > 0;

                // More specific error message detection
                const errorMessages = document.querySelectorAll([
                    // Only actual error messages
                    '.error-message:not(h1):not(h2):not(h3):not([role="heading"])',
                    '.error-text:not(h1):not(h2):not(h3):not([role="heading"])',
                    '.alert-error:not(h1):not(h2):not(h3):not([role="heading"])',
                    // Only alert roles that are not headings and contain error text
                    '[role="alert"]:not(h1):not(h2):not(h3):not([role="heading"]):not([aria-hidden="true"])',
                    // Error states in forms
                    'form .error:not([role="heading"])',
                    'form .invalid:not([role="heading"])',
                    // Error messages in modals
                    '.modal .error:not([role="heading"])',
                    '.modal .alert-error:not([role="heading"])',
                    // Error messages in notifications
                    '.notification.error:not([role="heading"])',
                    '.toast.error:not([role="heading"])'
                ].join(','));

                // Filter out hidden error messages and non-error elements
                const visibleErrors = Array.from(errorMessages).filter(el => {
                    const style = window.getComputedStyle(el);
                    const isVisible = style.display !== 'none' &&
                                     style.visibility !== 'hidden' &&
                                     style.opacity !== '0';

                    // Ignore elements that are likely not errors
                    const isNotError = el.tagName.toLowerCase().startsWith('h') ||
                                     el.getAttribute('role') === 'heading' ||
                                     el.textContent?.includes('|') ||
                                     el.textContent?.includes('Collection') ||
                                     el.textContent?.includes('Tommy') ||
                                     el.textContent?.includes('Hilfiger');

                    // Only include elements that look like actual errors
                    const looksLikeError = el.textContent?.toLowerCase().includes('error') ||
                                         el.textContent?.toLowerCase().includes('failed') ||
                                         el.textContent?.toLowerCase().includes('invalid') ||
                                         el.textContent?.toLowerCase().includes('not found');

                    return isVisible && !isNotError && looksLikeError;
                });

                const hasErrors = visibleErrors.length > 0;

                // Get error details for logging
                const errorDetails = visibleErrors.map(el => ({
                    text: el.textContent?.trim(),
                    type: el.getAttribute('role') || el.className,
                    visible: true
                }));

                // Get performance metrics without validation
                const performanceMetrics = {
                    navigationTiming: performance.getEntriesByType('navigation')[0],
                    paintTiming: performance.getEntriesByType('paint'),
                    lcp: performance.getEntriesByType('largest-contentful-paint')[0],
                    cls: performance.getEntriesByType('layout-shift')[0],
                    longTasks: performance.getEntriesByType('longtask')
                };

                return {
                    isInteractive,
                    isLoading,
                    hasErrors,
                    errorDetails,
                    readyState: document.readyState,
                    performanceMetrics
                };
            });

            // Log performance metrics (basic validation)
            if (pageLoadStatus.performanceMetrics) {
                console.log('✅ Performance metrics collected successfully');
            } else {
                console.log('⚠️ Performance metrics not available');
            }

            if (!pageLoadStatus.isInteractive) {
                throw new Error(\`Page not interactive, readyState: \${pageLoadStatus.readyState}\`);
            }

            if (pageLoadStatus.isLoading) {
                console.log('⚠️ Page still shows loading indicators');
            }

            if (pageLoadStatus.hasErrors) {
                console.log('⚠️ Page contains error messages:');
                pageLoadStatus.errorDetails.forEach(error => {
                    console.log(\`   - \${error.text} (\${error.type})\`);
                });
            }

            // STEP 7: Final render wait (REDUCED)
            await page.waitForTimeout(500);

            console.log(\`🎉 Total load time: \${Date.now() - startTime}ms\`);
            return true;

        } catch (error) {
            console.log(\`❌ Page load error: \${error.message}\`);
            return false;
        }
    };

    // CRITICAL IMAGE LOADING FIX (OPTIMIZED)
    const waitForCriticalImages = async (timeout = 3000) => {
        const startTime = Date.now();

        try {
            // Wait for images to appear in DOM
            const imageCount = await page.locator('img').count();
            console.log(\`📸 Found \${imageCount} images\`);

            if (imageCount === 0) {
                console.log('📸 No images to load');
                return true;
            }

            // Wait for at least one image to be visible
            await Promise.race([
                page.waitForSelector('img', { state: 'visible', timeout: 2000 }),
                page.waitForTimeout(2000)
            ]);

            // Improved scrolling implementation
            await page.evaluate(async () => {
                const scrollToBottom = async () => {
                    const scrollHeight = document.documentElement.scrollHeight;
                    const viewportHeight = window.innerHeight;
                    const totalSteps = Math.ceil(scrollHeight / viewportHeight);

                    for (let step = 0; step < totalSteps; step++) {
                        const scrollTo = step * viewportHeight;
                        window.scrollTo(0, scrollTo);
                        // Wait for any lazy loading to trigger
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    // Final scroll to bottom
                    window.scrollTo(0, scrollHeight);
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Scroll back to top
                    window.scrollTo(0, 0);
                    await new Promise(resolve => setTimeout(resolve, 500));
                };

                await scrollToBottom();
            });

            // Optimized image loading detection
            const imageLoadResult = await Promise.race([
                // Strategy 1: Wait for all images to load
                page.waitForFunction(
                    () => {
                        const images = Array.from(document.querySelectorAll('img'));
                        if (images.length === 0) return true;

                        // Check all images, not just visible ones
                        const loadedImages = images.filter(img => {
                            return img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
                        });

                        const loadRatio = loadedImages.length / images.length;

                        // Require 80% of all images to be loaded
                        return loadRatio >= 0.8;
                    },
                    { timeout: timeout }
                ),

                // Strategy 2: Timeout fallback
                page.waitForTimeout(timeout).then(() => {
                    console.log('📸 Image loading timeout reached');
                    return true;
                })
            ]);

            // Verify image dimensions and log loading status
            const imageStatus = await page.evaluate(() => {
                const images = Array.from(document.querySelectorAll('img'));
                return images.map(img => ({
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    complete: img.complete,
                    src: img.src,
                    visible: img.getBoundingClientRect().width > 0 &&
                            img.getBoundingClientRect().height > 0,
                    position: {
                        top: img.getBoundingClientRect().top,
                        bottom: img.getBoundingClientRect().bottom,
                        left: img.getBoundingClientRect().left,
                        right: img.getBoundingClientRect().right
                    }
                }));
            });

            const validImages = imageStatus.filter(img => img.width > 0 && img.height > 0);
            const visibleImages = imageStatus.filter(img => img.visible);
            const loadedVisibleImages = visibleImages.filter(img => img.complete);

            console.log(\`📸 Image loading status:\`);
            console.log(\`   - Total images: \${imageCount}\`);
            console.log(\`   - Valid images: \${validImages.length}/\${imageCount}\`);
            console.log(\`   - Visible images: \${visibleImages.length}/\${imageCount}\`);
            console.log(\`   - Loaded visible images: \${loadedVisibleImages.length}/\${visibleImages.length}\`);

            if (loadedVisibleImages.length < visibleImages.length) {
                console.log('📸 Some visible images failed to load:');
                visibleImages
                    .filter(img => !img.complete)
                    .forEach(img => {
                        console.log(\`   - \${img.src}\`);
                        console.log(\`     Position: top=\${img.position.top}, bottom=\${img.position.bottom}\`);
                    });
            }

            console.log(\`📸 Images processed in \${Date.now() - startTime}ms\`);
            return validImages.length > 0;

        } catch (error) {
            console.log(\`📸 Image loading error: \${error.message}\`);
            return false;
        }
    };

    // NAVIGATION ELEMENT LOADING
    const waitForNavigation = async () => {
        try {
            const navSelectors = [
                'nav',
                '.menu',
                '.navigation',
                'header nav',
                '[role="navigation"]',
                'a[href]:not([href="#"])'
            ];

            for (const selector of navSelectors) {
                const count = await page.locator(selector).count();
                if (count > 0) {
                    await Promise.race([
                        page.waitForSelector(selector, { state: 'visible', timeout: 3000 }),
                        page.waitForTimeout(3000)
                    ]);
                    console.log(\`🔗 Navigation loaded: \${selector}\`);
                    return true;
                }
            }

            console.log('🔗 No navigation elements found');
            return false;

        } catch (e) {
            console.log('🔗 Navigation loading timeout');
            return false;
        }
    };

    // Page type configurations for different timeout strategies
    const getPageConfig = (pageType: string): PageLoadOptions => {
        const configs: Record<string, PageLoadOptions> = {
            homepage: {
                timeout: 10000,
                imageTimeout: 3000,
                networkIdleTimeout: 1000
            },
            bio: {
                timeout: 8000,
                imageTimeout: 2000,
                networkIdleTimeout: 1000
            },
            assets: {
                timeout: 12000,
                imageTimeout: 4000,
                networkIdleTimeout: 1000
            },
            default: {
                timeout: 8000,
                imageTimeout: 3000,
                networkIdleTimeout: 1000
            }
        };

        return configs[pageType] || configs.default;
    };

    // Enhanced step wrapper with error handling
    const enhancedStep = async (stepName: string, pageType: string, action: () => Promise<void>) => {
        const startTime = Date.now();
        console.log(\`🚀 Starting: \${stepName}\`);

        try {
            // Execute the action
            await action();

            // Apply appropriate waiting strategy based on page type
            const config = getPageConfig(pageType);
            const success = await waitForFullPageLoad(pageType, config);

            if (success) {
                console.log(\`✅ \${stepName} completed in \${Date.now() - startTime}ms\`);
            } else {
                console.log(\`⚠️ \${stepName} completed with warnings in \${Date.now() - startTime}ms\`);
            }

        } catch (error) {
            console.log(\`❌ \${stepName} failed: \${error.message}\`);

            // Don't fail the entire journey for navigation issues
            if (error.message.includes('timeout') || error.message.includes('navigation')) {
                console.log(\`⚠️ Continuing journey despite \${stepName} failure\`);
            } else {
                throw error;
            }
        }
    };

    // HOMEPAGE STEP
    step('Go to homepage', async () => {
        await enhancedStep('Go to homepage', 'homepage', async () => {
            await page.goto(baseUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });
        });
    });
`;

  // Process each navigation item with enhanced logic
  data.pages.forEach((page, index) => {
    // Skip the homepage if it's the first page and matches baseUrl
    if (page.url === data.baseUrl && index === 0) {
      return;
    }

    // Determine page type based on URL/label for appropriate timeouts
    let pageType = "default";
    const label = page.label.toLowerCase();
    if (label.includes("bio") || label.includes("about")) {
      pageType = "bio";
    } else if (
      label.includes("asset") ||
      label.includes("media") ||
      label.includes("gallery")
    ) {
      pageType = "assets";
    } else if (label.includes("press") || label.includes("release")) {
      pageType = "default";
    }

    // Escape special characters in the page label and href
    const escapedLabel = page.label.replace(/"/g, '\\"');
    const escapedHref = page.href.replace(/"/g, '\\"');

    code += `
    step('Navigate to "${escapedLabel}"', async () => {
        await enhancedStep('Navigate to "${escapedLabel}"', '${pageType}', async () => {
            try {
                // Multiple selection strategies for robust navigation
                const selectors = [
                    'a[href*="' + '${escapedHref.replace(/^\.\//, "")}' + '"]',
                    'nav a:has-text("${escapedLabel}")',
                    'a:has-text("${escapedLabel}")',
                    'a[href="' + '${escapedHref}' + '"]'
                ];

                let clicked = false;
                for (const selector of selectors) {
                    try {
                        const element = page.locator(selector).first();
                        const count = await element.count();
                        if (count > 0) {
                            await element.click();
                            clicked = true;
                            console.log(\`✅ Clicked using selector: \${selector}\`);
                            break;
                        }
                    } catch (e) {
                        console.log(\`⚠️ Selector failed: \${selector} - \${e.message}\`);
                        continue;
                    }
                }

                if (!clicked) {
                    throw new Error('Could not find clickable element for ${escapedLabel}');
                }

            } catch (e) {
                console.log('🔄 Falling back to direct navigation for ${escapedLabel}');
                await page.goto('${page.url}', {
                    waitUntil: 'domcontentloaded',
                    timeout: 20000
                });
            }
        });
    });

    step('Return to previous page', async () => {
        await enhancedStep('Return to previous page', 'homepage', async () => {
            try {
                await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
                console.log('✅ Browser back navigation successful');
            } catch (e) {
                console.log('🔄 Back navigation failed, using direct navigation');
                await page.goto(baseUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 15000
                });
            }
        });
    });`;
  });

  // Add final step
  code += `
    step('Final homepage verification', async () => {
        await enhancedStep('Final homepage verification', 'homepage', async () => {
            // Ensure we're back on the homepage
            const currentUrl = page.url();
            if (!currentUrl.includes(baseUrl)) {
                console.log('🔄 Navigating back to homepage for final verification');
                await page.goto(baseUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 15000
                });
            } else {
                console.log('✅ Already on homepage');
            }
        });
    });
});
`;

  return code;
}

// ENHANCED: Better downloadable resource detection with proper assets page handling
function isDownloadableResource(url: string): boolean {
  const extension = path.extname(url).toLowerCase();

  // **ENHANCED: Smart assets page detection that preserves actual downloads**
  // Only skip if it's a directory path ending with /assets/ or /assets, not actual files
  const isAssetsDirectory =
    ((url.endsWith("/assets/") || url.endsWith("/assets")) && !extension) || // No file extension = directory, not file
    (url.includes("/assets/") &&
      (url.endsWith("/assets/") || url.endsWith("/assets")) &&
      !extension);

  if (isAssetsDirectory) {
    console.log(`🔍 Checking URL: ${url}`);
    console.log(`   Extension: ${extension}`);
    console.log(
      `   Assets page detected - treating as regular page, not download`,
    );
    console.log(`   Final result: ❌ NOT DOWNLOADABLE`);
    return false;
  }

  // Enhanced list of downloadable extensions
  const downloadableExtensions = [
    ".pdf",
    ".zip",
    ".rar",
    ".7z", // Archives and documents
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".csv",
    ".txt", // Documents
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".svg", // Images
    ".mp4",
    ".mov",
    ".avi",
    ".wmv",
    ".mp3",
    ".wav", // Media
    ".psd",
    ".ai",
    ".eps",
    ".indd", // Design files
  ];

  // Enhanced press kit specific download patterns
  const downloadKeywords = [
    // Press kit specific patterns (removed generic '/assets/' since we handle it above)
    "/download",
    "/files/",
    "/media/",
    "/press/",
    "product.zip",
    "stills.zip",
    "images.zip",
    "media.zip",
    "gallery.zip",
    "press.zip",
    "campaign.zip",
    "press_release",
    "press-release",
    "presskit",
    "high-res",
    "highres",
    "high_res",
    "press_kit",
    "press-kit",
    // Tommy Hilfiger specific patterns
    "tommy_hilfiger",
    "tommy-hilfiger",
    "mercedes-amg",
    "mercedes_amg",
    "clarence_ruth",
    "clarence-ruth",
  ];

  const hasDownloadExtension = downloadableExtensions.includes(extension);
  const hasDownloadKeyword = downloadKeywords.some((keyword) =>
    url.toLowerCase().includes(keyword.toLowerCase()),
  );

  // **ENHANCED: More precise download detection that allows assets.zip, asset.zip, etc.**
  const isDownloadLink =
    url.toLowerCase().includes("download") ||
    url.toLowerCase().includes("files/") ||
    url.toLowerCase().includes("media/") ||
    url.toLowerCase().includes("press/") ||
    url.toLowerCase().includes("product.zip") ||
    url.toLowerCase().includes("stills.zip") ||
    url.toLowerCase().includes("images.zip") ||
    url.toLowerCase().includes("campaign.zip") ||
    url.toLowerCase().includes("press_release") ||
    url.toLowerCase().includes("press-release") ||
    url.toLowerCase().includes("high-res") ||
    url.toLowerCase().includes("highres") ||
    // **NEW: Allow assets.zip, asset.zip but not /assets/ directories**
    (url.toLowerCase().includes("assets") && extension.length > 0);

  console.log(`🔍 Checking URL: ${url}`);
  console.log(`   Extension: ${extension}`);
  console.log(`   Has download extension: ${hasDownloadExtension}`);
  console.log(`   Has download keyword: ${hasDownloadKeyword}`);
  console.log(`   Is download link: ${isDownloadLink}`);

  const isDownloadable =
    hasDownloadExtension || hasDownloadKeyword || isDownloadLink;
  console.log(
    `   Final result: ${isDownloadable ? "✅ DOWNLOADABLE" : "❌ NOT DOWNLOADABLE"}`,
  );

  return isDownloadable;
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
    // Get all images on the page
    const images = await page.$$eval("img", (imgs) =>
      imgs.map((img) => ({
        src: img.src || img.getAttribute("data-src") || "",
        alt: img.alt || "",
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      })),
    );

    // Debug: Log first few image URLs to see what we're checking
    console.log(`   Sample image URLs being checked:`);
    images.slice(0, 3).forEach((img, i) => {
      console.log(`     ${i + 1}. ${img.src}`);
    });

    // Track total images found globally
    globalTotalLinksFound += images.length;

    // Use configurable limit for image validation
    const maxImagesToValidate = Math.min(
      images.length,
      config.allowedDownloads.maxImagesToValidate || 200,
    );
    const imagesToValidate = images.slice(0, maxImagesToValidate);

    console.log(
      `   Found ${images.length} images, validating ${Math.min(images.length, maxImagesToValidate)}...`,
    );

    // No URL-specific logic - just check if links work

    // Validate each image - ONLY CHECK IF BROKEN, DON'T TRY TO FIX
    for (const img of imagesToValidate) {
      if (!img.src) continue;

      try {
        // Simply check if the URL works
        const check = await verifyResourceExists(img.src, true);

        if (check.exists) {
          results.validImages.push({
            src: img.src,
            alt: img.alt,
          });
        } else {
          // URL is broken - report it
          results.brokenImages.push({
            src: img.src,
            alt: img.alt,
            correctedUrl: undefined, // No suggestions, just report broken
            statusCode: check.statusCode,
            error: check.error || "Resource not found",
          });
        }
      } catch (error) {
        // Invalid URL or other error
        results.brokenImages.push({
          src: img.src,
          alt: img.alt,
          error:
            error instanceof Error
              ? error.message
              : "Invalid URL or unknown error",
        });
      }
    }

    // Also check for clickable asset links (images wrapped in anchor tags)
    const assetLinks = await page.$$eval('a[href*="/assets/"]', (links) =>
      links.map((link) => ({
        href: (link as HTMLAnchorElement).href,
        text: (link as HTMLAnchorElement).textContent?.trim() || "",
        innerHTML: (link as HTMLAnchorElement).innerHTML,
      })),
    );

    // Also check for video links if configured
    const videoSelectors =
      'video source, iframe[src*="youtube"], iframe[src*="vimeo"], a[href*=".mp4"], a[href*=".mov"], a[href*=".webm"]';
    const videoElements = await page.$$eval(videoSelectors, (elements) =>
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
        .filter(Boolean),
    );

    // Validate videos if any found
    const maxVideosToValidate =
      config.allowedDownloads.maxVideosToValidate || 50;
    if (videoElements.length > 0) {
      console.log(
        `   Found ${videoElements.length} video links, validating up to ${maxVideosToValidate}...`,
      );
      const videosToCheck = videoElements.slice(0, maxVideosToValidate);

      for (const video of videosToCheck) {
        if (video && typeof video === "object" && "url" in video) {
          const check = await verifyResourceExists(video.url, true);
          if (!check.exists) {
            globalBrokenVideos++;
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
      globalVideosFound += videoElements.length;
      globalVideosValidated += Math.min(
        videoElements.length,
        maxVideosToValidate,
      );
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
      `⚠️ Error validating asset images: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return results;
}

// Better resource verification with proper headers and retry logic
async function verifyResourceExists(
  url: string,
  silent: boolean = false,
): Promise<{
  exists: boolean;
  contentLength?: number;
  statusCode?: number;
  error?: string;
}> {
  const maxRetries = silent ? 1 : 3; // Fewer retries for bulk validation
  let currentRetry = 0;

  while (currentRetry < maxRetries) {
    try {
      if (!silent) {
        console.log(
          `📥 Resource verification attempt ${currentRetry + 1}/${maxRetries}: ${url}`,
        );
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
          timeout: silent ? 5000 : 30000, // Shorter timeout for bulk validation
        };

        const req = protocol.request(url, options, (res) => {
          const statusCode = res.statusCode || 0;
          const contentType = res.headers["content-type"] || "";
          const contentLength = parseInt(
            res.headers["content-length"] || "0",
            10,
          );

          if (!silent) {
            console.log(`📥 Resource check response:`);
            console.log(`   Status: ${statusCode}`);
            console.log(`   Content-Type: ${contentType}`);
            console.log(`   Content-Length: ${formatFileSize(contentLength)}`);
          }

          // Some servers return 405 for HEAD requests - treat as success if it's an image
          const isSuccess =
            (statusCode >= 200 && statusCode < 400) ||
            (statusCode === 405 &&
              url.match(/\.(jpg|jpeg|png|gif|webp|tiff|bmp)$/i)); // Method not allowed for HEAD on images
          // Note: 403 Forbidden and 401 Unauthorized should NEVER be treated as success

          req.destroy();

          if (!silent) {
            console.log(
              `   Result: ${isSuccess ? "✅ EXISTS" : "❌ NOT FOUND"}`,
            );
          }
          resolve({ exists: isSuccess, contentLength, statusCode });
        });

        req.on("error", (error) => {
          if (!silent) {
            console.log(`❌ Resource verification error: ${error.message}`);
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
        console.log(`❌ Resource verification exception: ${error}`);
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
    console.log(
      `❌ All ${maxRetries} verification attempts failed for: ${url}`,
    );
  }
  return { exists: false, error: "All verification attempts failed" };
}

// ENHANCED: Download function with improved error handling and retry logic
async function downloadFile(
  url: string,
  destination: string,
): Promise<boolean> {
  const maxRetries = 3;
  let currentRetry = 0;

  while (currentRetry < maxRetries) {
    try {
      console.log(
        `📥 Download attempt ${currentRetry + 1}/${maxRetries}: ${url}`,
      );

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
          timeout: 60000, // Increased timeout to 60 seconds
        };

        const req = protocol.get(url, options, (response) => {
          const statusCode = response.statusCode || 0;

          console.log(`📥 Download response: ${statusCode} for ${url}`);

          // Handle redirects
          if (
            statusCode >= 300 &&
            statusCode < 400 &&
            response.headers.location
          ) {
            file.close();
            fs.existsSync(destination) && fs.unlinkSync(destination);

            const redirectUrl = new URL(
              response.headers.location,
              url,
            ).toString();
            console.log(`↗️ Following redirect to: ${redirectUrl}`);

            // Recursive call for redirect
            downloadFile(redirectUrl, destination).then(resolve);
            return;
          }

          // Check if the response is successful
          if (statusCode >= 200 && statusCode < 300) {
            // Check content type
            const contentType = response.headers["content-type"] || "";
            console.log(`📄 Content-Type: ${contentType}`);

            // Check content length
            const contentLength = parseInt(
              response.headers["content-length"] || "0",
              10,
            );
            console.log(`📦 Content-Length: ${formatFileSize(contentLength)}`);

            if (contentLength > config.allowedDownloads.maxFileSize) {
              console.log(
                `⚠️ File size ${formatFileSize(contentLength)} exceeds maximum allowed size of ${formatFileSize(config.allowedDownloads.maxFileSize)}`,
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
                console.log(
                  `⚠️ Download cancelled: File size exceeded during download`,
                );
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
                    `✅ Successfully downloaded: ${destination} (${formatFileSize(stats.size)})`,
                  );
                  if (!isResolved) {
                    isResolved = true;
                    resolve(true);
                  }
                } else {
                  console.log(`❌ Downloaded file is empty: ${destination}`);
                  fs.unlinkSync(destination);
                  if (!isResolved) {
                    isResolved = true;
                    resolve(false);
                  }
                }
              } else {
                console.log(`❌ Downloaded file not found: ${destination}`);
                if (!isResolved) {
                  isResolved = true;
                  resolve(false);
                }
              }
            });

            file.on("error", (error) => {
              console.log(`❌ File write error: ${error.message}`);
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
            console.log(`❌ Download failed: HTTP ${statusCode}`);
            if (!isResolved) {
              isResolved = true;
              resolve(false);
            }
          }
        });

        req.on("error", (error) => {
          file.close();
          fs.existsSync(destination) && fs.unlinkSync(destination);
          console.log(`❌ Download request error: ${error.message}`);
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
      console.log(`❌ Download exception: ${error}`);
      currentRetry++;
      if (currentRetry < maxRetries) {
        const delay = currentRetry * 2000;
        console.log(`⏱️ Retrying download in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.log(`❌ All ${maxRetries} download attempts failed for: ${url}`);
  return false;
}

// Helper to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Generate comprehensive broken links report
async function generateBrokenLinksReport(
  brokenLinks: Map<string, BrokenLink[]>,
) {
  if (brokenLinks.size === 0) {
    console.log("\n✅ No broken links found during validation!");
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
      markdown += `#### ${index + 1}. ${link.type.toUpperCase()}: ${link.url}\n\n`;

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
  console.log("\n" + "=".repeat(80));
  console.log("📊 BROKEN LINKS REPORT GENERATED");
  console.log("=".repeat(80));
  console.log(`\n🔴 Total Broken Links Found: ${totalBrokenLinks}`);
  console.log(
    `\n📍 Pages with Issues (${report.summary.pagesWithBrokenLinks}):\n`,
  );

  for (const [pageUrl, links] of Object.entries(brokenByPage)) {
    console.log(`\n  ${pageUrl}`);
    console.log(`  └─ ${links.length} broken link(s):\n`);

    links.forEach((link, index) => {
      console.log(
        `     ${index + 1}. [${link.type.toUpperCase()}] ${link.url}`,
      );
      if (link.suggestedFix) {
        console.log(`        → Suggested: ${link.suggestedFix}`);
      }
    });
  }

  console.log("\n" + "=".repeat(80));
  console.log("📁 Reports saved to:");
  console.log(`   JSON: ${jsonPath}`);
  console.log(`   Markdown: ${mdPath}`);
  console.log(`   Latest: ${latestJsonPath}`);
  console.log("=".repeat(80) + "\n");
}

// **NEW FUNCTION: Scan current page for download links**
async function scanPageForDownloads(page: Page, pageName: string) {
  console.log(`🔍 Scanning "${pageName}" for download links...`);

  const downloadLinks = await page.evaluate(() => {
    const downloads: Array<{
      text: string;
      href: string;
      fullText: string;
      isDownload: boolean;
    }> = [];

    // Enhanced selectors for download links on the current page
    const downloadSelectors = [
      // Direct download links
      'a[href*=".zip"]',
      'a[href*=".pdf"]',
      'a[href*=".rar"]',
      'a[href*=".7z"]',

      // Links with download keywords
      'a[href*="download"]',
      'a[href*="assets/"]',
      'a[href*="media/"]',
      'a[href*="files/"]',

      // Press kit specific patterns
      'a[href*="product.zip"]',
      'a[href*="stills.zip"]',
      'a[href*="images.zip"]',
      'a[href*="campaign.zip"]',
      'a[href*="press.zip"]',
      'a[href*="gallery.zip"]',

      // Text-based detection
      'a:has-text("download")',
      'a:has-text("Download")',
      'a:has-text("DOWNLOAD")',
      "a[download]",

      // Class-based detection
      ".download",
      ".download-link",
      ".download-btn",
      ".asset-download",

      // Press kit specific text patterns
      'a:has-text("stills")',
      'a:has-text("Stills")',
      'a:has-text("STILLS")',
      'a:has-text("high-res")',
      'a:has-text("High-Res")',
      'a:has-text("assets")',
      'a:has-text("Assets")',
      'a:has-text("ASSETS")',
    ];

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

          // **ADD THIS NEW FILTER HERE** ⬇️
          if (href.endsWith("/assets/") || href.endsWith("/assets")) {
            continue; // Skip assets page URLs, they're not downloads
          }
          // **END OF NEW FILTER** ⬆️

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
      } catch (e) {
        // Skip invalid selectors
        continue;
      }
    }

    return downloads;
  });

  if (downloadLinks.length > 0) {
    console.log(
      `📥 Found ${downloadLinks.length} download links on "${pageName}":`,
    );
    downloadLinks.forEach((link, idx) => {
      console.log(`   ${idx + 1}. 📥 ${link.text} (${link.href})`);
    });
    return downloadLinks;
  } else {
    console.log(`📥 No download links found on "${pageName}"`);
    return [];
  }
}
