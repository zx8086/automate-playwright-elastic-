/* src/test.spec.ts */

import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as https from "https";
import { config } from "../config";

test.describe("Site Navigation Test with Steps", () => {
  test.setTimeout(180000); // 3 minutes

  test.beforeEach(async ({ page }) => {
    [config.server.screenshotDir, config.server.downloadsDir, config.server.syntheticsDir].forEach((dir) => {
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

    // Log all navigation items
    navigationItems.forEach((item, idx) => {
      console.log(`${idx + 1}. ${item.text} (${item.href})`);
    });

    // Take screenshot of navigation menu
    await page.screenshot({
      path: path.join(config.server.screenshotDir, "navigation-menu.png")
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
            console.log(`Handling downloadable resource: ${item.text}`);

            // Get absolute URL
            const absoluteUrl = new URL(item.href, page.url()).toString();

            // Verify the resource exists
            const resourceExists = await verifyResourceExists(absoluteUrl);

            if (resourceExists) {
              console.log(`✅ Resource ${item.text} exists and is accessible`);

              // Try to download the file
              const downloadPath = path.join(
                config.server.downloadsDir,
                path.basename(item.href)
              );
              const downloadSuccessful = await downloadFile(
                absoluteUrl,
                downloadPath
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

            console.log(`Direct navigation to: ${absoluteUrl}`);
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
                elementCounts: elementCounts
              });

              // Take screenshot of the page
              await page.screenshot({
                path: path.join(
                  config.server.screenshotDir,
                  `${item.text.replace(/\s+/g, "-").toLowerCase()}.png`
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
      await exportElasticSyntheticsData(navigationPaths, config.server.syntheticsDir);

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

// Identify navigation items
async function identifyNavigation(page: Page) {
  console.log("Analyzing navigation structure...");
  
  const navItems = await page.evaluate(() => {
    const cleanText = (html: string | null): string => {
      if (!html) return '';
      return html.replace(/<br\s*\/?>/g, ' ').replace(/\s+/g, ' ').trim();
    };
    
    const items: Array<{
      text: string;
      href: string;
      fullText: string;
    }> = [];

    // Generic navigation selectors that work for most sites
    const navSelectors = [
      'nav a',                    // Standard nav links
      'header a',                 // Header links
      '.menu a',                  // Menu links
      '.navbar a',                // Navbar links
      '.navigation a',            // Navigation links
      '[role="navigation"] a',    // ARIA navigation
      '.main-menu a',             // Main menu
      '.site-nav a',              // Site navigation
      '.primary-nav a',           // Primary navigation
      '.secondary-nav a',         // Secondary navigation
      'footer a'                  // Footer links
    ];
    
    // Try each selector
    for (const selector of navSelectors) {
      const links = document.querySelectorAll(selector);
      
      for (const link of links) {
        const href = link.getAttribute('href');
        if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:')) {
          continue;
        }
        
        // Get text content, handling nested elements
        let text = '';
        let fullText = '';
        
        if (link.children.length > 0) {
          // Handle nested elements
          const childTexts = Array.from(link.children).map(child => 
            cleanText(child.textContent)
          ).filter(Boolean);
          
          text = childTexts[0] || cleanText(link.textContent);
          fullText = childTexts.join(' ').trim() || text;
        } else {
          text = cleanText(link.textContent);
          fullText = text;
        }
        
        if (!text) continue;
        
        // Check if this link is already in our list
        if (!items.some(item => item.href === href)) {
          items.push({ 
            text, 
            href: href as string,
            fullText
          });
        }
      }
    }
    
    return items;
  });
  
  if (navItems.length === 0) {
    console.log("No navigation items found with standard selectors, trying generic approach...");
    
    // Fallback to generic approach
    const genericNavItems = await page.evaluate(() => {
      const items: Array<{
        text: string;
        href: string;
        fullText: string;
      }> = [];
      
      // Get all links that might be navigation
      const allLinks = document.querySelectorAll('a[href]:not([href^="#"]):not([href^="javascript:"]):not([href^="mailto:"])');
      
      for (const link of allLinks) {
        const href = link.getAttribute('href');
        if (!href) continue;
        
        const text = link.textContent?.trim() || '';
        if (!text) continue;
        
        // Skip if this link is already in our list
        if (!items.some(item => item.href === href)) {
          items.push({ 
            text, 
            href: href as string,
            fullText: text
          });
        }
      }
      
      return items;
    });
    
    console.log("Generic approach found items:", genericNavItems);
    return genericNavItems;
  }
  
  return navItems;
}

// Helper to check for page-specific elements
async function checkPageSpecificElements(page: Page, pageName: string) {
  await test.step(`Check ${pageName} page elements`, async () => {
    // Common elements to check
    const elementCounts = await getElementCounts(page);

    console.log(
      `Page "${pageName}" contains: ${JSON.stringify(elementCounts)}`,
    );

    // Look for page-specific elements based on page name
    if (pageName.toLowerCase().includes("bio") ||
      pageName.toLowerCase().includes("about") ||
      pageName.toLowerCase().includes("tommy")) {
      const bioSpecificElements = await page
        .locator("article, .bio, .biography")
        .count();
      console.log(`Found ${bioSpecificElements} biography-specific elements`);
    } else if (pageName.toLowerCase().includes("contact")) {
      const contactElements = await page
        .locator('form, [type="email"], [type="tel"], address')
        .count();
      console.log(`Found ${contactElements} contact-specific elements`);
    } else if (pageName.toLowerCase().includes("asset") ||
      pageName.toLowerCase().includes("image") ||
      pageName.toLowerCase().includes("media")) {
      // Check for asset-specific elements
      const assetElements = await page
        .locator(".gallery, .download, [download]")
        .count();
      console.log(`Found ${assetElements} asset-specific elements`);
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
              ${path.elementCounts ? `<div class="element-counts">Elements: ${JSON.stringify(path.elementCounts)}</div>` : ''}
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

    ${downloadableResources.length > 0
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
  outputDir: string
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
      href: page.to.split('/').pop() || ''
    };
  });
  
  // Export JSON for use with Elastic Synthetics
  const syntheticsData = {
    baseUrl: config.server.baseUrl,
    pages: pagesData,
    timestamp: new Date().toISOString()
  };
  
  // Save as JSON in the synthetics directory
  fs.writeFileSync(
    path.join(config.server.syntheticsDir, "synthetics-data.json"), 
    JSON.stringify(syntheticsData, null, 2)
  );
  
  // Generate and save Elastic Synthetics test file with correct name
  const testCode = generateElasticSyntheticsTest(syntheticsData);
  const siteId = new URL(config.server.baseUrl).pathname.split('/').filter(Boolean).pop() || 'site';
  const fileName = `core.journey.ts`;
  const filePath = path.join(config.server.syntheticsDir, fileName);
  
  fs.writeFileSync(filePath, testCode);
  
  console.log(`Exported Elastic Synthetics data to: ${path.join(config.server.syntheticsDir, "synthetics-data.json")}`);
  console.log(`Generated Elastic Synthetics test at: ${filePath}`);
  
  return syntheticsData;
}

// Update the generateElasticSyntheticsTest function
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
  
  // Start building the test code
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

    // Helper function to wait for full page load including images
    const waitForFullPageLoad = async () => {
        const startTime = Date.now();
        try {
            // Wait for DOM to be ready - this is essential
            await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
            console.log('DOM loaded in ' + (Date.now() - startTime) + 'ms');
            
            // Wait for body to be visible - quick check
            await page.waitForSelector('body', { state: 'visible', timeout: 5000 });
            console.log('Body visible in ' + (Date.now() - startTime) + 'ms');
            
            // Check for gallery and asset images - only if they exist
            const hasGalleryImages = await page.locator('.gallery img, .assets img').count() > 0;
            if (hasGalleryImages) {
                try {
                    await page.waitForFunction(() => {
                        const images = document.querySelectorAll('.gallery img, .assets img');
                        return Array.from(images).every(img => img.complete);
                    }, { timeout: 5000 });
                    console.log('Gallery images loaded in ' + (Date.now() - startTime) + 'ms');
                } catch (e) {
                    console.log('Gallery images still loading, continuing...');
                }
            }

            // Check for thumbnails - only if they exist
            const hasThumbnails = await page.locator('img[src*="thumbnail"]').count() > 0;
            if (hasThumbnails) {
                try {
                    await page.waitForSelector('img[src*="thumbnail"]', { state: 'visible', timeout: 5000 });
                    console.log('Thumbnails loaded in ' + (Date.now() - startTime) + 'ms');
                } catch (e) {
                    console.log('Thumbnails still loading, continuing...');
                }
            }

            // Quick scroll to trigger lazy loading if needed
            if (hasGalleryImages || hasThumbnails) {
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                    window.scrollTo(0, 0);
                });
                console.log('Scroll completed in ' + (Date.now() - startTime) + 'ms');
            }

            // Short wait for any final network activity
            await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
                console.log('Network still active, continuing...');
            });
            
            console.log('Total page load time: ' + (Date.now() - startTime) + 'ms');
        } catch (e) {
            console.log('Page load timeout after ' + (Date.now() - startTime) + 'ms, continuing...');
        }
    };

    step('Go to homepage', async () => {
        try {
            await page.goto(baseUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 10000 
            });
            await waitForFullPageLoad();
        } catch (e) {
            console.log('Initial page load failed, retrying...');
            await page.goto(baseUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 10000 
            });
            await waitForFullPageLoad();
        }
    });
`;

  // Process each navigation item
  data.pages.forEach((page, index) => {
    // Skip the homepage if it's the first page and matches baseUrl
    if (page.url === data.baseUrl && index === 0) {
      return;
    }
    
    code += `
    step('Navigate to "${page.label}"', async () => {
        try {
            // Try role-based selector with full text
            await page.getByRole('link', { name: '${page.fullText?.replace(/'/g, "\\'") || page.label.replace(/'/g, "\\'")}' }).click();
            await waitForFullPageLoad();
        } catch (e) {
            try {
                // Try href-based selector
                await page.locator('a[href*="${page.href.replace(/^\.\//, '')}"]').click();
                await waitForFullPageLoad();
            } catch (e) {
                try {
                    // Try text-based selector
                    await page.locator('a').filter({ hasText: '${page.label.replace(/'/g, "\\'")}' }).click();
                    await waitForFullPageLoad();
                } catch (e) {
                    // Direct navigation as fallback
                    await page.goto('${page.url}', {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000
                    });
                    await waitForFullPageLoad();
                }
            }
        }
    });

    step('Return to previous page', async () => {
        try {
            // Try browser back
            await page.goBack({ waitUntil: 'networkidle' });
            await waitForFullPageLoad();
        } catch (e) {
            // Fallback to direct navigation
            await page.goto(baseUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });
            await waitForFullPageLoad();
        }
    });`;
  });
  
  // Add final navigation
  code += `
    step('Return to homepage', async () => {
        try {
            // Try browser back
            await page.goBack({ waitUntil: 'networkidle' });
            await waitForFullPageLoad();
        } catch (e) {
            // Fallback to direct navigation
            await page.goto(baseUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });
            await waitForFullPageLoad();
        }
    });
});
`;

  return code;
}

// Helper to identify downloadable resources
function isDownloadableResource(url: string): boolean {
  const extension = path.extname(url).toLowerCase();
  return config.allowedDownloads.extensions.includes(extension);
}

// Helper to verify if a resource exists
async function verifyResourceExists(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const protocol = url.startsWith("https") ? https : http;

    const req = protocol.request(url, { method: "HEAD" }, (res) => {
      const statusCode = res.statusCode || 0;
      resolve(statusCode >= 200 && statusCode < 400);
    });

    req.on("error", () => {
      resolve(false);
    });

    req.end();
  });
}

// Helper to download a file
async function downloadFile(
  url: string,
  destination: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const protocol = url.startsWith("https") ? https : http;

    const file = fs.createWriteStream(destination);
    let downloadedSize = 0;

    const req = protocol.get(url, (response) => {
      const statusCode = response.statusCode || 0;
      
      // Check if the response is successful
      if (statusCode >= 200 && statusCode < 400) {
        // Check content type
        const contentType = response.headers['content-type'];
        if (contentType && !config.allowedDownloads.allowedMimeTypes.includes(contentType)) {
          console.log(`⚠️ Skipping download: Unsupported content type ${contentType}`);
          file.close();
          fs.unlinkSync(destination);
          resolve(false);
          return;
        }

        // Check content length
        const contentLength = parseInt(response.headers['content-length'] || '0', 10);
        if (contentLength > config.allowedDownloads.maxFileSize) {
          console.log(`⚠️ Skipping download: File size ${formatFileSize(contentLength)} exceeds maximum allowed size ${formatFileSize(config.allowedDownloads.maxFileSize)}`);
          file.close();
          fs.unlinkSync(destination);
          resolve(false);
          return;
        }

        // Handle download progress
        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (downloadedSize > config.allowedDownloads.maxFileSize) {
            console.log(`⚠️ Download cancelled: File size exceeds maximum allowed size`);
            req.destroy();
            file.close();
            fs.unlinkSync(destination);
            resolve(false);
          }
        });

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          console.log(`✅ Successfully downloaded: ${destination} (${formatFileSize(downloadedSize)})`);
          resolve(true);
        });
      } else {
        file.close();
        fs.unlinkSync(destination);
        console.log(`⚠️ Download failed: HTTP ${statusCode}`);
        resolve(false);
      }
    });

    req.on("error", (error) => {
      file.close();
      fs.existsSync(destination) && fs.unlinkSync(destination);
      console.log(`⚠️ Download error: ${error.message}`);
      resolve(false);
    });

    // Add timeout
    req.setTimeout(30000, () => {
      req.destroy();
      file.close();
      fs.existsSync(destination) && fs.unlinkSync(destination);
      console.log(`⚠️ Download timeout after 30 seconds`);
      resolve(false);
    });
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