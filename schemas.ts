/* schemas.ts */

import * as path from "node:path";
import { z } from "zod";

// ============================================================================
// BASIC ENUMS
// ============================================================================

export const EnvironmentType = z.enum(["development", "staging", "production", "test"]);
export const ScreenshotMode = z.enum(["on", "off", "only-on-failure"]);
export const VideoMode = z.enum(["on", "off", "retain-on-failure"]);
export const TraceMode = z.enum(["on", "off", "retain-on-failure"]);

// ============================================================================
// FORMAT FUNCTIONS
// ============================================================================

export const HttpsUrl = z.url();
export const PositiveInt = z.int32().min(1);
export const FileSizeBytes = z.int32().min(1);
export const Milliseconds = z.int32().min(0);

// ============================================================================
// COMPLEX VALIDATORS
// ============================================================================

export const DirectoryPath = z
  .string()
  .refine((val) => val.startsWith("./") || val.startsWith("/") || val.startsWith("../"), {
    message: "Directory path must be relative (./) or absolute (/)",
  });

export const FileExtension = z.string();

export const MimeType = z.string().superRefine((val, ctx) => {
  const mimePattern = /^[a-z]+\/[a-z0-9.+-]+$/i;
  if (!mimePattern.test(val)) {
    ctx.addIssue({
      code: "custom",
      message: "Invalid MIME type format",
    });
    return;
  }
});

// ============================================================================
// CONFIGURATION SCHEMAS
// ============================================================================

export const ServerConfigSchema = z.strictObject({
  baseUrl: HttpsUrl,
  screenshotDir: DirectoryPath,
  downloadsDir: DirectoryPath,
  syntheticsDir: DirectoryPath,
  pauseBetweenClicks: Milliseconds,
  environment: EnvironmentType,
  department: z.string(),
  departmentShort: z.string(),
  domain: z.string(),
  service: z.string(),
  journeyType: z.string(),
});

export const BrowserConfigSchema = z.strictObject({
  headless: z.boolean(),
  viewport: z.strictObject({
    width: PositiveInt,
    height: PositiveInt,
  }),
  ignoreHTTPSErrors: z.boolean(),
  screenshot: ScreenshotMode,
  video: VideoMode,
  trace: TraceMode,
});

export const DownloadConfigSchema = z.strictObject({
  extensions: z.array(FileExtension),
  maxFileSize: FileSizeBytes,
  allowedMimeTypes: z.array(MimeType),
  downloadTimeout: Milliseconds,
  maxRetries: PositiveInt,
  retryDelay: Milliseconds,
  validateAssetImages: z.boolean(),
  downloadSampleAssets: z.boolean(),
  maxSampleAssets: PositiveInt,
  maxImagesToValidate: PositiveInt,
  maxVideosToValidate: PositiveInt,
});

// ============================================================================
// MAIN CONFIGURATION SCHEMA
// ============================================================================

export const ConfigSchema = z
  .strictObject({
    server: ServerConfigSchema,
    browser: BrowserConfigSchema,
    allowedDownloads: DownloadConfigSchema,
  })
  .superRefine((data, ctx) => {
    if (
      data.browser.headless &&
      (data.browser.video === "on" || data.browser.screenshot === "on")
    ) {
      console.warn("Warning: Video/Screenshot recording in headless mode may not work as expected");
    }

    const paths = [data.server.screenshotDir, data.server.downloadsDir, data.server.syntheticsDir];
    const uniquePaths = new Set(paths.map((p) => path.resolve(p)));
    if (uniquePaths.size !== paths.length) {
      ctx.addIssue({
        code: "custom",
        message: "Screenshot, downloads, and synthetics directories must be different",
      });
    }
  });

// ============================================================================
// APPLICATION-SPECIFIC SCHEMAS
// ============================================================================

export const ElementCountsSchema = z
  .object({
    images: z.number().int().nonnegative().describe("Number of images found"),
    paragraphs: z.number().int().nonnegative().describe("Number of paragraphs found"),
    headings: z.number().int().nonnegative().describe("Number of headings found"),
    links: z.number().int().nonnegative().describe("Number of links found"),
    buttons: z.number().int().nonnegative().describe("Number of buttons found"),
  })
  .describe("Page element counts for analytics");

export const BrokenLinkSchema = z
  .object({
    url: z.url().or(z.string()),
    pageFound: z.string(),
    type: z.enum(["image", "asset", "download"]),
    altText: z.string().optional(),
    suggestedFix: z.string().optional(),
    statusCode: z.number().int().min(100).max(599).optional(),
    error: z.string().max(500).optional(),
    pageUrl: z.string().optional(),
    brokenUrl: z.string().optional(),
  })
  .describe("Broken link information");

export const BrokenLinksReportSchema = z
  .object({
    reportDate: z.iso.datetime({ offset: true }),
    baseUrl: z.url(),
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
  .refine((data) => data.summary.pagesWithBrokenLinks <= data.summary.totalPages, {
    message: "Pages with broken links cannot exceed total pages",
  })
  .describe("Complete broken links report");

export const NavigationPathSchema = z
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

export const SkippedDownloadSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    label: z.string().min(1).max(200),
    fileSize: z.number().int().positive().optional(),
    reason: z.string().min(1).max(500),
  })
  .describe("Information about skipped downloads");

// ============================================================================
// SCHEMA REGISTRY
// ============================================================================

export const SchemaRegistry = {
  Server: ServerConfigSchema,
  Browser: BrowserConfigSchema,
  Download: DownloadConfigSchema,
  Config: ConfigSchema,
  ElementCounts: ElementCountsSchema,
  BrokenLink: BrokenLinkSchema,
  BrokenLinksReport: BrokenLinksReportSchema,
  NavigationPath: NavigationPathSchema,
  SkippedDownload: SkippedDownloadSchema,
} as const;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type Config = z.infer<typeof ConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type BrowserConfig = z.infer<typeof BrowserConfigSchema>;
export type DownloadConfig = z.infer<typeof DownloadConfigSchema>;
export type ElementCounts = z.infer<typeof ElementCountsSchema>;
export type BrokenLink = z.infer<typeof BrokenLinkSchema>;
export type BrokenLinksReport = z.infer<typeof BrokenLinksReportSchema>;
export type NavigationPath = z.infer<typeof NavigationPathSchema>;
export type SkippedDownload = z.infer<typeof SkippedDownloadSchema>;
