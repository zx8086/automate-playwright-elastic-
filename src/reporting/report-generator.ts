/* src/reporting/report-generator.ts */

/**
 * Report generation module.
 * Generates broken links reports and visual sitemaps.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { BrokenLink, BrokenLinksReport, NavigationPath } from "../../config";
import { config } from "../../config";
import { formatFileSize } from "../utils";

// ============================================================================
// REPORT GENERATOR CLASS
// ============================================================================

export class ReportGenerator {
  private reportsDir: string;

  constructor(reportsDir: string = "./broken-links-reports") {
    this.reportsDir = reportsDir;
  }

  /**
   * Generate a comprehensive broken links report
   */
  async generateBrokenLinksReport(brokenLinks: Map<string, BrokenLink[]>): Promise<void> {
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
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }

    // Generate timestamp for unique filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);

    // Write JSON report
    const jsonPath = path.join(this.reportsDir, `broken-links-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    // Generate Markdown report
    const markdown = this.generateMarkdownReport(report, brokenByPage);
    const mdPath = path.join(this.reportsDir, `broken-links-${timestamp}.md`);
    fs.writeFileSync(mdPath, markdown);

    // Also write a latest version for easy access
    const latestJsonPath = path.join(this.reportsDir, "broken-links-latest.json");
    const latestMdPath = path.join(this.reportsDir, "broken-links-latest.md");
    fs.writeFileSync(latestJsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(latestMdPath, markdown);

    // Console output with clear summary
    this.printConsoleSummary(report, brokenByPage, jsonPath, mdPath, latestJsonPath);
  }

  /**
   * Generate a markdown report
   */
  private generateMarkdownReport(
    report: BrokenLinksReport,
    brokenByPage: Record<string, BrokenLink[]>
  ): string {
    let markdown = `# Broken Links Report\n\n`;
    markdown += `**Date:** ${new Date().toLocaleString()}\n`;
    markdown += `**Base URL:** ${config.server.baseUrl}\n`;
    markdown += `**Total Broken Links:** ${report.totalBrokenLinks}\n\n`;

    markdown += `## Summary\n\n`;
    markdown += `- Pages with broken links: ${report.summary.pagesWithBrokenLinks}\n`;
    markdown += `- Broken images: ${report.summary.brokenImages}\n`;
    markdown += `- Broken assets: ${report.summary.brokenAssets}\n\n`;

    markdown += `## Broken Links by Page\n\n`;

    for (const [pageUrl, links] of Object.entries(brokenByPage)) {
      markdown += `### Page: ${pageUrl}\n\n`;
      markdown += `Found ${links.length} broken link(s):\n\n`;

      links.forEach((link, index) => {
        const typeLabel = (link.type || "LINK").toUpperCase();
        const linkText = link.altText || "Unknown";
        markdown += `#### ${index + 1}. [${typeLabel}] "${linkText}"\n\n`;
        markdown += `- **URL:** \`${link.url || link.brokenUrl}\`\n`;

        if (link.error) {
          markdown += `- **Error:** ${link.error}\n`;
        }

        if (link.statusCode) {
          markdown += `- **Status Code:** HTTP ${link.statusCode}\n`;
        }

        markdown += `\n`;
      });

      markdown += `---\n\n`;
    }

    return markdown;
  }

  /**
   * Print console summary
   */
  private printConsoleSummary(
    report: BrokenLinksReport,
    brokenByPage: Record<string, BrokenLink[]>,
    jsonPath: string,
    mdPath: string,
    latestJsonPath: string
  ): void {
    console.log(`\n${"=".repeat(80)}`);
    console.log("BROKEN LINKS REPORT GENERATED");
    console.log("=".repeat(80));
    console.log(`\n[ERROR] Total Broken Links Found: ${report.totalBrokenLinks}`);
    console.log(`\n[PAGES] Pages with Issues (${report.summary.pagesWithBrokenLinks}):\n`);

    for (const [pageUrl, links] of Object.entries(brokenByPage)) {
      // Extract page name from URL for cleaner display
      const pageName = pageUrl.split("/").filter(Boolean).pop() || "home";
      console.log(`\n  Page: ${pageName}`);
      console.log(`  URL: ${pageUrl}`);
      console.log(`  Issues: ${links.length} broken link(s)\n`);

      links.forEach((link, index) => {
        const typeLabel = (link.type || "link").toUpperCase();
        const linkText = link.altText || "Unknown";
        console.log(`     ${index + 1}. [${typeLabel}] "${linkText}"`);
        console.log(`        URL: ${link.url || link.brokenUrl}`);
        if (link.error) {
          console.log(`        Error: ${link.error}`);
        }
        if (link.statusCode) {
          console.log(`        Status: HTTP ${link.statusCode}`);
        }
        // Add spacing between broken link entries
        console.log("");
      });
    }

    console.log(`\n${"=".repeat(80)}`);
    console.log("Reports saved to:");
    console.log(`   JSON: ${jsonPath}`);
    console.log(`   Markdown: ${mdPath}`);
    console.log(`   Latest: ${latestJsonPath}`);
    console.log(`${"=".repeat(80)}\n`);
  }

  /**
   * Create a visual sitemap
   */
  async createVisualSitemap(paths: NavigationPath[], outputDir: string): Promise<void> {
    // Regular pages and downloadable resources
    const regularPages = paths.filter((p) => !p.isDownloadable);
    const downloadableResources = paths.filter((p) => p.isDownloadable);

    // Create a simple HTML sitemap file
    const sitemapHtml = this.generateSitemapHtml(paths, regularPages, downloadableResources);

    fs.writeFileSync(path.join(outputDir, "sitemap.html"), sitemapHtml);
    console.log(`Created visual sitemap at: ${path.join(outputDir, "sitemap.html")}`);
  }

  /**
   * Generate sitemap HTML
   */
  private generateSitemapHtml(
    paths: NavigationPath[],
    regularPages: NavigationPath[],
    downloadableResources: NavigationPath[]
  ): string {
    return `
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
              (navPath) => `
            <div class="link">
              - ${navPath.label} (${navPath.to})
              ${navPath.elementCounts ? `<div class="element-counts">Elements: ${JSON.stringify(navPath.elementCounts)}</div>` : ""}
              <img class="screenshot" src="${navPath.label.replace(/\s+/g, "-").toLowerCase()}.png" onerror="this.style.display='none'" />
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
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let reportGeneratorInstance: ReportGenerator | null = null;

/**
 * Get the shared ReportGenerator instance
 */
export function getReportGenerator(): ReportGenerator {
  if (!reportGeneratorInstance) {
    reportGeneratorInstance = new ReportGenerator();
  }
  return reportGeneratorInstance;
}
