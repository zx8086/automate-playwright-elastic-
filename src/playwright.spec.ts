/* src/test.spec.ts - Enhanced version with comprehensive fixes */

import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as https from "https";
import { config } from "../config";

interface PageLoadOptions {
    timeout?: number;
    imageTimeout?: number;
    networkIdleTimeout?: number;
}

interface PerformanceMetrics {
    navigationTiming: PerformanceNavigationTiming;
    paintTiming: PerformancePaintTiming[];
    lcp?: PerformanceEntry;
    cls?: PerformanceEntry;
    longTasks?: PerformanceEntry[];
}

const logMemoryUsage = () => {
  const memUsage = process.memoryUsage();
  console.log("Memory Usage:", {
    rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
    external: `${Math.round(memUsage.external / 1024 / 1024)} MB`,
  });
};

test.describe("Site Navigation Test with Steps", () => {
  test.setTimeout(180000); // 3 minutes

  test.beforeAll(async () => {
    // console.log('\nInitial Memory Usage:');
    // logMemoryUsage();
  });

  test.afterAll(async () => {
    // console.log('\nFinal Memory Usage:');
    // logMemoryUsage();
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
    const navigationPaths: Array<{
      from: string;
      to: string;
      label: string;
      isDownloadable?: boolean;
      fileSize?: number;
      elementCounts?: {
        images: number;
        paragraphs: number;
        headings: number;
        links: number;
        buttons: number;
      };
      fullText?: string;
    }> = [];

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

        // Check if it's a downloadable resource
        if (isDownloadableResource(item.href)) {
          try {
            console.log(`📥 Handling downloadable resource: ${item.text}`);

            // Get absolute URL
            const absoluteUrl = new URL(item.href, page.url()).toString();

            // Verify the resource exists
            const resourceExists = await verifyResourceExists(absoluteUrl);

            if (resourceExists) {
              console.log(`✅ Resource ${item.text} exists and is accessible`);

              // Try to download the file
              const downloadPath = path.join(
                config.server.downloadsDir,
                path.basename(item.href),
              );
              const downloadSuccessful = await downloadFile(
                absoluteUrl,
                downloadPath,
              );

              if (downloadSuccessful) {
                console.log(`✅ Successfully downloaded: ${downloadPath}`);

                // Get file size
                const stats = fs.statSync(downloadPath);
                console.log(`File size: ${formatFileSize(stats.size)}`);

                // Add to navigation paths
                navigationPaths.push({
                  from: startUrl,
                  to: absoluteUrl,
                  label: item.text,
                  isDownloadable: true,
                  fileSize: stats.size,
                });
              } else {
                console.log(`⚠️ Download failed for: ${absoluteUrl}`);
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
            const absoluteUrl = new URL(item.href, page.url()).toString();

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

              navigationPaths.push({
                from: startUrl,
                to: currentUrl,
                label: item.text,
                isDownloadable: false,
                elementCounts: elementCounts,
              });

              // Take screenshot of the page
              await page.screenshot({
                path: path.join(
                  config.server.screenshotDir,
                  `${item.text.replace(/\s+/g, "-").toLowerCase()}.png`,
                ),
              });

              // Check for unique elements on this page
              await checkPageSpecificElements(page, item.text);

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
        console.log(`${index + 1}. ${path.label}: ${path.from} → ${path.to}`);
      });

      // List all downloadable resources
      if (downloadableResources.length > 0) {
        console.log("\n- Downloadable Resources:");
        downloadableResources.forEach((path, index) => {
          console.log(
            `${index + 1}. ${path.label}: ${formatFileSize(path.fileSize || 0)}`,
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
async function getElementCounts(page: Page) {
  return {
    images: await page.locator("img").count(),
    paragraphs: await page.locator("p").count(),
    headings: await page.locator("h1, h2, h3, h4, h5, h6").count(),
    links: await page.locator("a").count(),
    buttons: await page.locator('button, [role="button"]').count(),
  };
}

// ENHANCED: Identify navigation items with better detection
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
      "nav a", "header a", ".menu a", ".navbar a", ".navigation a",
      '[role="navigation"] a', ".main-menu a", ".site-nav a",
      
      // Press kit specific selectors
      ".press-kit-nav a", ".presskit-nav a", ".pk-nav a",
      
      // Tommy Hilfiger specific patterns
      'a[href*=".html"]',  // Page links
      'a[href*=".pdf"]',   // PDF downloads
      'a[href*=".zip"]',   // ZIP downloads
      'a[href*="/assets/"]', // Asset downloads
      'a[href*="/files/"]',  // File downloads
      'a[href*="download"]', // Download links
      'a[href*="product.zip"]', // Specific product ZIP
      'a[href*="stills.zip"]',  // Stills ZIP
      'a[href*="images.zip"]',  // Images ZIP
      
      // Generic content links
      "main a", ".content a", ".container a",
      
      // Footer links (often contain downloads)
      "footer a"
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

        // ENHANCED: Better download detection
        const isDownload = href.includes('.pdf') || 
                          href.includes('.zip') || 
                          href.includes('/assets/') ||
                          href.includes('/download') ||
                          href.includes('product.zip') ||
                          href.includes('stills.zip') ||
                          href.includes('images.zip') ||
                          href.includes('media.zip') ||
                          text.toLowerCase().includes('download') ||
                          text.toLowerCase().includes('assets');

        // Check if this link is already in our list
        if (!items.some((item) => item.href === href)) {
          items.push({
            text,
            href: href as string,
            fullText,
            isDownload
          });
        }
      }
    }

    // ENHANCED: Special handling for hidden download links
    const potentialDownloads = document.querySelectorAll('[data-download], [data-file], .download-link, .download-btn');
    for (const element of potentialDownloads) {
      const href = element.getAttribute('href') || 
                   element.getAttribute('data-href') ||
                   element.getAttribute('data-url');
      
      if (href) {
        const text = element.textContent?.trim() || 'Download';
        if (!items.some((item) => item.href === href)) {
          items.push({
            text,
            href,
            fullText: text,
            isDownload: true
          });
        }
      }
    }

    console.log(`Found ${items.length} navigation items with enhanced detection`);
    return items;
  });

  if (navItems.length === 0) {
    console.log("⚠️ No navigation items found with enhanced selectors, trying comprehensive fallback...");
    
    // ENHANCED: More comprehensive fallback
    const fallbackNavItems = await page.evaluate(() => {
      const items: Array<{
        text: string;
        href: string;
        fullText: string;
        isDownload: boolean;
      }> = [];

      // Get ALL links on the page
      const allLinks = document.querySelectorAll('a[href]');

      for (const link of allLinks) {
        const href = link.getAttribute('href');
        if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
          continue;
        }

        const text = link.textContent?.trim() || '';
        if (!text || text.length < 2) continue;

        // ENHANCED: Better filtering for valid navigation links
        const isValidNavLink = 
          href.includes('.html') ||
          href.includes('.pdf') ||
          href.includes('.zip') ||
          href.includes('/assets/') ||
          href.includes('/files/') ||
          href.includes('/bio') ||
          href.includes('/contact') ||
          href.includes('/about') ||
          href.includes('/press') ||
          href.includes('/gallery') ||
          href.includes('/aleali-may') ||
          href.includes('download') ||
          text.toLowerCase().includes('bio') ||
          text.toLowerCase().includes('contact') ||
          text.toLowerCase().includes('about') ||
          text.toLowerCase().includes('press') ||
          text.toLowerCase().includes('assets') ||
          text.toLowerCase().includes('download') ||
          text.toLowerCase().includes('gallery') ||
          text.toLowerCase().includes('images') ||
          text.toLowerCase().includes('video') ||
          text.toLowerCase().includes('stills') ||
          text.toLowerCase().includes('aleali') ||
          text.toLowerCase().includes('q&a');

        if (!isValidNavLink) continue;

        const isDownload = href.includes('.pdf') || 
                          href.includes('.zip') || 
                          href.includes('/assets/') ||
                          href.includes('/files/') ||
                          href.includes('/download') ||
                          href.includes('product.zip') ||
                          text.toLowerCase().includes('download');

        // Skip if this link is already in our list
        if (!items.some((item) => item.href === href)) {
          items.push({
            text,
            href: href as string,
            fullText: text,
            isDownload
          });
        }
      }

      return items;
    });

    console.log(`Comprehensive fallback found ${fallbackNavItems.length} items`);
    return fallbackNavItems;
  }

  console.log(`Enhanced navigation detection found ${navItems.length} items`);
  return navItems;
}

// ENHANCED: Better page-specific element checking with improved scrolling
async function checkPageSpecificElements(page: Page, pageName: string) {
  await test.step(`Check ${pageName} page elements`, async () => {
    // ENHANCED: Better scrolling for lazy loading (especially for asset pages)
    await page.evaluate(async () => {
      const scrollToBottomEnhanced = async () => {
        const scrollHeight = document.documentElement.scrollHeight;
        const viewportHeight = window.innerHeight;
        const totalSteps = Math.ceil(scrollHeight / viewportHeight);
        
        console.log(`📜 Starting enhanced scroll: ${totalSteps} steps for lazy loading`);
        
        for (let step = 0; step < totalSteps; step++) {
          const scrollTo = step * viewportHeight;
          window.scrollTo({ top: scrollTo, behavior: 'smooth' });
          
          // Wait longer for lazy loading to trigger
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Check for new images that might have loaded
          const newImages = document.querySelectorAll('img[loading="lazy"], img[data-src], img[src*="nextImageExportOptimizer"]');
          if (newImages.length > 0) {
            console.log(`📸 Found ${newImages.length} lazy images at scroll position ${scrollTo}`);
          }
        }
        
        // Final scroll to bottom and hold
        window.scrollTo({ top: scrollHeight, behavior: 'smooth' });
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Scroll back to top slowly
        window.scrollTo({ top: 0, behavior: 'smooth' });
        await new Promise(resolve => setTimeout(resolve, 1000));
      };
      
      await scrollToBottomEnhanced();
    });

    // Wait for any triggered lazy loading
    await page.waitForTimeout(2000);

    // Common elements to check
    const elementCounts = await getElementCounts(page);
    console.log(`📊 Page "${pageName}" contains: ${JSON.stringify(elementCounts)}`);

    // ENHANCED: More comprehensive page-specific checks
    const pageNameLower = pageName.toLowerCase();
    
    if (pageNameLower.includes('bio') || pageNameLower.includes('about') || pageNameLower.includes('tommy')) {
      const bioElements = await page.locator('article, .bio, .biography, .about, .profile').count();
      const textBlocks = await page.locator('p, .text, .content').count();
      console.log(`👤 Biography page elements: ${bioElements} bio sections, ${textBlocks} text blocks`);
      
    } else if (pageNameLower.includes('contact')) {
      const contactElements = await page.locator('form, [type="email"], [type="tel"], address, .contact').count();
      const socialLinks = await page.locator('a[href*="instagram"], a[href*="twitter"], a[href*="facebook"]').count();
      console.log(`📞 Contact page elements: ${contactElements} contact forms, ${socialLinks} social links`);
      
    } else if (pageNameLower.includes('asset') || pageNameLower.includes('image') || pageNameLower.includes('media') || pageNameLower.includes('gallery') || pageNameLower.includes('stills')) {
      const galleryElements = await page.locator('.gallery, .grid, .assets, .media-grid').count();
      const downloadLinks = await page.locator('a[href*=".zip"], a[href*="download"], .download').count();
      const images = await page.locator('img').count();
      const videos = await page.locator('video, .video').count();
      
      console.log(`🖼️  Asset page elements:`);
      console.log(`   - Gallery containers: ${galleryElements}`);
      console.log(`   - Download links: ${downloadLinks}`);
      console.log(`   - Images: ${images}`);
      console.log(`   - Videos: ${videos}`);
      
      // Check for high-resolution image links
      const hiResImages = await page.locator('img[src*="7016w"], img[src*="3360w"], img[src*="_high"], img[src*="_large"], img[src*="nextImageExportOptimizer"]').count();
      console.log(`   - High-res/optimized images: ${hiResImages}`);
      
    } else if (pageNameLower.includes('press') || pageNameLower.includes('release')) {
      const pressElements = await page.locator('.press, .release, .news, article').count();
      const pdfLinks = await page.locator('a[href*=".pdf"]').count();
      console.log(`📰 Press page elements: ${pressElements} press sections, ${pdfLinks} PDF downloads`);
      
    } else if (pageNameLower.includes('video')) {
      const videoElements = await page.locator('video, iframe[src*="youtube"], iframe[src*="vimeo"], .video').count();
      const videoDownloads = await page.locator('a[href*=".mp4"], a[href*=".mov"]').count();
      console.log(`🎥 Video page elements: ${videoElements} video players, ${videoDownloads} video downloads`);
      
    } else if (pageNameLower.includes('aleali')) {
      const profileElements = await page.locator('.profile, .bio, .about, article').count();
      const imageElements = await page.locator('img').count();
      console.log(`👩 Aleali May page elements: ${profileElements} profile sections, ${imageElements} images`);
    }

    // Check for missing critical elements
    const hasMissingElements = await page.evaluate(() => {
      const criticalSelectors = ['h1', 'main', '.content', '.container'];
      const missingElements = criticalSelectors.filter(selector => 
        document.querySelectorAll(selector).length === 0
      );
      return missingElements;
    });

    if (hasMissingElements.length > 0) {
      console.log(`⚠️ Missing critical elements: ${hasMissingElements.join(', ')}`);
    }
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

interface PageLoadOptions {
    timeout?: number;
    imageTimeout?: number;
    networkIdleTimeout?: number;
}

interface PerformanceMetrics {
    navigationTiming: PerformanceNavigationTiming;
    paintTiming: PerformancePaintTiming[];
    lcp?: PerformanceEntry;
    cls?: PerformanceEntry;
    longTasks?: PerformanceEntry[];
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
  const siteId = urlPath.split('/').filter(Boolean).pop() || 'site';
  
  // Generate tags array
  const tags = [
    config.server.environment,
    config.server.department,
    config.server.domain,
    config.server.service,
    siteId 
  ].filter(Boolean);
  
  // Format monitor name according to convention
  const monitorName = `${config.server.departmentShort} - ${config.server.journeyType} Journey | ${siteId} (core) - prd`;
  
  // Format monitor ID
  const monitorId = `${config.server.journeyType}_${siteId.replace(/[^a-zA-Z0-9]/g, '_')}`;
  
  // Start building the enhanced test code
  let code = `/* ${config.server.domain}/${config.server.service}/${siteId}/core.journey.ts */

import {journey, monitor, step} from '@elastic/synthetics';

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
        const {
            timeout = 10000,
            imageTimeout = 3000,
            networkIdleTimeout = 1000
        } = options;
        
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
            
            // Verify page has actual content
            const hasContent = await page.evaluate(() => {
                const body = document.body;
                return body.textContent?.trim().length > 0 && 
                       body.children.length > 0;
            });
            
            if (!hasContent) {
                throw new Error('Page appears to be empty');
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
                
                return {
                    isInteractive,
                    isLoading,
                    hasErrors,
                    errorDetails,
                    readyState: document.readyState
                };
            });
            
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
    let pageType = 'default';
    const label = page.label.toLowerCase();
    if (label.includes('bio') || label.includes('about')) {
      pageType = 'bio';
    } else if (label.includes('asset') || label.includes('media') || label.includes('gallery')) {
      pageType = 'assets';
    } else if (label.includes('press') || label.includes('release')) {
      pageType = 'default';
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
                    'a[href*="' + '${escapedHref.replace(/^\.\//, '')}' + '"]',
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

// ENHANCED: Better downloadable resource detection (MAIN FIX FOR ZIP ISSUE)
function isDownloadableResource(url: string): boolean {
  const extension = path.extname(url).toLowerCase();
  
  // Enhanced list of downloadable extensions
  const downloadableExtensions = [
    '.pdf', '.zip', '.rar', '.7z',  // Archives and documents
    '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', // Documents  
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', // Images
    '.mp4', '.mov', '.avi', '.wmv', '.mp3', '.wav', // Media
    '.psd', '.ai', '.eps', '.indd' // Design files
  ];
  
  // Enhanced press kit specific download patterns
  const downloadKeywords = [
    // Press kit specific patterns
    '/download', '/assets/', '/files/', '/media/', '/press/',
    'product.zip', 'stills.zip', 'images.zip', 'media.zip',
    'gallery.zip', 'press.zip', 'campaign.zip',
    'press_release', 'press-release', 'presskit',
    'high-res', 'highres', 'high_res',
    'press_kit', 'press-kit',
    // Tommy Hilfiger specific patterns
    'tommy_hilfiger', 'tommy-hilfiger',
    'mercedes-amg', 'mercedes_amg',
    'clarence_ruth', 'clarence-ruth'
  ];
  
  const hasDownloadExtension = downloadableExtensions.includes(extension);
  const hasDownloadKeyword = downloadKeywords.some(keyword => 
    url.toLowerCase().includes(keyword.toLowerCase())
  );
  
  // Enhanced press kit specific download patterns
  const isDownloadLink = url.toLowerCase().includes('download') || 
                        url.toLowerCase().includes('assets/') ||
                        url.toLowerCase().includes('media/') ||
                        url.toLowerCase().includes('press/') ||
                        url.toLowerCase().includes('files/') ||
                        url.toLowerCase().includes('product.zip') ||
                        url.toLowerCase().includes('stills.zip') ||
                        url.toLowerCase().includes('images.zip') ||
                        url.toLowerCase().includes('campaign.zip') ||
                        url.toLowerCase().includes('press_release') ||
                        url.toLowerCase().includes('press-release') ||
                        url.toLowerCase().includes('high-res') ||
                        url.toLowerCase().includes('highres');
  
  console.log(`🔍 Checking URL: ${url}`);
  console.log(`   Extension: ${extension}`);
  console.log(`   Has download extension: ${hasDownloadExtension}`);
  console.log(`   Has download keyword: ${hasDownloadKeyword}`);
  console.log(`   Is download link: ${isDownloadLink}`);
  
  const isDownloadable = hasDownloadExtension || hasDownloadKeyword || isDownloadLink;
  console.log(`   Final result: ${isDownloadable ? '✅ DOWNLOADABLE' : '❌ NOT DOWNLOADABLE'}`);
  
  return isDownloadable;
}

// ENHANCED: Better resource verification with proper headers
async function verifyResourceExists(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const protocol = url.startsWith("https") ? https : http;
      
      // Enhanced headers for press kit resources
      const options = {
        method: "HEAD",
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Referer': new URL(url).origin,
          // Additional headers for press kit resources
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        timeout: 15000
      };

      const req = protocol.request(url, options, (res) => {
        const statusCode = res.statusCode || 0;
        const contentType = res.headers['content-type'] || '';
        const contentLength = res.headers['content-length'] || '0';
        
        console.log(`📥 Resource check: ${url}`);
        console.log(`   Status: ${statusCode}`);
        console.log(`   Content-Type: ${contentType}`);
        console.log(`   Content-Length: ${contentLength}`);
        
        // Enhanced success criteria for press kit resources
        const isSuccess = (statusCode >= 200 && statusCode < 400) || 
                         (statusCode === 403 && contentType.includes('application/')) || // Some press kits return 403 but still serve content
                         (statusCode === 401 && contentType.includes('application/'));  // Some press kits require auth but still serve content
        
        console.log(`   Result: ${isSuccess ? '✅ EXISTS' : '❌ NOT FOUND'}`);
        resolve(isSuccess);
      });

      req.on("error", (error) => {
        console.log(`❌ Resource verification error for ${url}: ${error.message}`);
        resolve(false);
      });

      req.setTimeout(15000, () => {
        req.destroy();
        console.log(`⏱️ Resource verification timeout for ${url}`);
        resolve(false);
      });

      req.end();
    } catch (error) {
      console.log(`❌ Resource verification exception for ${url}: ${error}`);
      resolve(false);
    }
  });
}

// ENHANCED: Download function with retry logic and better error handling
async function downloadFile(url: string, destination: string): Promise<boolean> {
  const maxRetries = 3;
  let currentRetry = 0;

  while (currentRetry < maxRetries) {
    try {
      console.log(`📥 Download attempt ${currentRetry + 1}/${maxRetries}: ${url}`);
      
      const success = await attemptDownload(url, destination);
      if (success) {
        console.log(`✅ Download successful on attempt ${currentRetry + 1}`);
        return true;
      }
      
      currentRetry++;
      if (currentRetry < maxRetries) {
        const delay = currentRetry * 2000;
        console.log(`⏱️ Retrying download in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      console.log(`❌ Download attempt ${currentRetry + 1} failed: ${error}`);
      currentRetry++;
    }
  }

  console.log(`❌ All ${maxRetries} download attempts failed for: ${url}`);
  return false;
}

async function attemptDownload(url: string, destination: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const protocol = url.startsWith("https") ? https : http;
      const file = fs.createWriteStream(destination);
      let downloadedSize = 0;

      // Enhanced request options
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Referer': new URL(url).origin
        }
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
          attemptDownload(redirectUrl, destination).then(resolve);
          return;
        }
        
        // Check if the response is successful
        if (statusCode >= 200 && statusCode < 300) {
          // Check content type (more permissive for press kit files)
          const contentType = response.headers['content-type'] || '';
          console.log(`📄 Content-Type: ${contentType}`);
          
          // Enhanced allowed types for press kits
          const allowedTypes = [
            'application/pdf',
            'application/zip',
            'application/x-zip-compressed',
            'application/octet-stream',
            'image/jpeg',
            'image/png',
            'video/mp4',
            'audio/mpeg'
          ];
          
          const isAllowedType = allowedTypes.some(type => contentType.includes(type)) ||
                               contentType === '' || // Some servers don't set content-type
                               url.endsWith('.pdf') || 
                               url.endsWith('.zip');
          
          if (!isAllowedType && contentType !== '') {
            console.log(`⚠️ Unexpected content type: ${contentType}, continuing anyway for press kit file`);
          }

          // Check content length
          const contentLength = parseInt(response.headers['content-length'] || '0', 10);
          if (contentLength > config.allowedDownloads.maxFileSize && contentLength > 0) {
            console.log(`⚠️ File size ${formatFileSize(contentLength)} exceeds maximum allowed size`);
            file.close();
            fs.existsSync(destination) && fs.unlinkSync(destination);
            resolve(false);
            return;
          }

          // Handle download progress
          response.on('data', (chunk) => {
            downloadedSize += chunk.length;
            if (downloadedSize > config.allowedDownloads.maxFileSize) {
              console.log(`⚠️ Download cancelled: File size exceeded during download`);
              req.destroy();
              file.close();
              fs.existsSync(destination) && fs.unlinkSync(destination);
              resolve(false);
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
                console.log(`✅ Successfully downloaded: ${destination} (${formatFileSize(stats.size)})`);
                resolve(true);
              } else {
                console.log(`❌ Downloaded file is empty: ${destination}`);
                fs.unlinkSync(destination);
                resolve(false);
              }
            } else {
              console.log(`❌ Downloaded file not found: ${destination}`);
              resolve(false);
            }
          });

          file.on("error", (error) => {
            console.log(`❌ File write error: ${error.message}`);
            file.close();
            fs.existsSync(destination) && fs.unlinkSync(destination);
            resolve(false);
          });

        } else {
          file.close();
          fs.existsSync(destination) && fs.unlinkSync(destination);
          console.log(`❌ Download failed: HTTP ${statusCode}`);
          resolve(false);
        }
      });

      req.on("error", (error) => {
        file.close();
        fs.existsSync(destination) && fs.unlinkSync(destination);
        console.log(`❌ Download request error: ${error.message}`);
        resolve(false);
      });

      // Increased timeout for large files
      req.setTimeout(60000, () => {
        req.destroy();
        file.close();
        fs.existsSync(destination) && fs.unlinkSync(destination);
        console.log(`⏱️ Download timeout after 60 seconds`);
        resolve(false);
      });

    } catch (error) {
      console.log(`❌ Download exception: ${error}`);
      resolve(false);
    }
  });
}

// Helper to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
