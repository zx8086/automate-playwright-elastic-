/* config.ts */

// ============================================================================
// IMPORTS & ENVIRONMENT SETUP
// ============================================================================

import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";
import { z } from "zod";
import {
  type BrokenLink,
  type BrokenLinksReport,
  type BrowserConfig,
  type Config,
  ConfigSchema,
  type DownloadConfig,
  type ElementCounts,
  type NavigationPath,
  SchemaRegistry,
  type ServerConfig,
  type SkippedDownload,
} from "./schemas";

// Environment detection and setup
if (typeof Bun === "undefined") {
  dotenv.config();
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function ensureDirectoryExists(dirPath: string): string {
  const fullPath = path.resolve(dirPath);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
  return dirPath;
}

function parseEnvVar(value: string | undefined, type: "string" | "number" | "boolean"): unknown {
  if (!value) return undefined;

  switch (type) {
    case "number": {
      const num = Number(value);
      return Number.isNaN(num) ? undefined : num;
    }
    case "boolean":
      return value.toLowerCase() === "true" || value === "1";
    default:
      return value;
  }
}

// ============================================================================
// 4-PILLAR CONFIGURATION PATTERN
// ============================================================================

// Pillar 1: Default Values
const enhancedAllowedDownloads = {
  extensions: [
    ".pdf",
    ".zip",
    ".rar",
    ".7z",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".csv",
    ".txt",
    ".rtf",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".svg",
    ".bmp",
    ".tiff",
    ".mp4",
    ".mov",
    ".avi",
    ".wmv",
    ".mp3",
    ".wav",
    ".m4v",
    ".webm",
    ".psd",
    ".ai",
    ".eps",
    ".indd",
    ".sketch",
  ],

  allowedMimeTypes: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "text/plain",
    "application/zip",
    "application/x-zip-compressed",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/bmp",
    "image/tiff",
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "audio/mpeg",
    "audio/wav",
    "video/webm",
    "application/octet-stream",
  ],

  maxFileSize: 104857600,
  downloadTimeout: 60000,
  maxRetries: 3,
  retryDelay: 2000,
  validateAssetImages: true,
  downloadSampleAssets: false,
  maxSampleAssets: 5,
  maxImagesToValidate: 200,
  maxVideosToValidate: 50,
};

const defaultConfig: Config = {
  server: {
    baseUrl: "https://www.prd.presskits.eu.pvh.cloud/tommyxmercedes-amgf1xclarenceruth/",
    screenshotDir: "./navigation-screenshots",
    downloadsDir: "./downloads",
    syntheticsDir: "./synthetics",
    pauseBetweenClicks: 1000,
    environment: "production" as const,
    department: "marketing_technology",
    departmentShort: "MT",
    domain: "eu-shared-services",
    service: "presskit",
    journeyType: "PressKit",
  },
  browser: {
    headless: false,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    screenshot: "on",
    video: "on",
    trace: "on",
  },
  allowedDownloads: {
    extensions: enhancedAllowedDownloads.extensions,
    maxFileSize: enhancedAllowedDownloads.maxFileSize,
    allowedMimeTypes: enhancedAllowedDownloads.allowedMimeTypes,
    downloadTimeout: enhancedAllowedDownloads.downloadTimeout,
    maxRetries: enhancedAllowedDownloads.maxRetries,
    retryDelay: enhancedAllowedDownloads.retryDelay,
    validateAssetImages: enhancedAllowedDownloads.validateAssetImages,
    downloadSampleAssets: enhancedAllowedDownloads.downloadSampleAssets,
    maxSampleAssets: enhancedAllowedDownloads.maxSampleAssets,
    maxImagesToValidate: enhancedAllowedDownloads.maxImagesToValidate,
    maxVideosToValidate: enhancedAllowedDownloads.maxVideosToValidate,
  },
};

// Pillar 2: Environment Variable Mapping
const envVarMapping = {
  server: {
    baseUrl: "BASE_URL",
    screenshotDir: "SCREENSHOT_DIR",
    downloadsDir: "DOWNLOADS_DIR",
    syntheticsDir: "SYNTHETICS_DIR",
    pauseBetweenClicks: "PAUSE_BETWEEN_CLICKS",
    environment: "ENVIRONMENT",
    department: "DEPARTMENT",
    departmentShort: "DEPARTMENT_SHORT",
    domain: "DOMAIN",
    service: "SERVICE",
    journeyType: "JOURNEY_TYPE",
  },
  browser: {
    headless: "BROWSER_HEADLESS",
    "viewport.width": "VIEWPORT_WIDTH",
    "viewport.height": "VIEWPORT_HEIGHT",
    ignoreHTTPSErrors: "IGNORE_HTTPS_ERRORS",
    screenshot: "SCREENSHOT_MODE",
    video: "VIDEO_MODE",
    trace: "TRACE_MODE",
  },
  allowedDownloads: {
    maxFileSize: "MAX_DOWNLOAD_SIZE",
    maxImagesToValidate: "MAX_IMAGES_TO_VALIDATE",
    maxVideosToValidate: "MAX_VIDEOS_TO_VALIDATE",
    validateAssetImages: "VALIDATE_ASSET_IMAGES",
  },
} as const;

// Pillar 3: Environment Loading
function loadConfigFromEnv(): Partial<Config> {
  const envSource = typeof Bun !== "undefined" ? Bun.env : process.env;

  return {
    server: {
      baseUrl:
        (parseEnvVar(envSource[envVarMapping.server.baseUrl], "string") as string) ||
        defaultConfig.server.baseUrl,
      screenshotDir:
        (parseEnvVar(envSource[envVarMapping.server.screenshotDir], "string") as string) ||
        defaultConfig.server.screenshotDir,
      downloadsDir:
        (parseEnvVar(envSource[envVarMapping.server.downloadsDir], "string") as string) ||
        defaultConfig.server.downloadsDir,
      syntheticsDir:
        (parseEnvVar(envSource[envVarMapping.server.syntheticsDir], "string") as string) ||
        defaultConfig.server.syntheticsDir,
      pauseBetweenClicks:
        (parseEnvVar(envSource[envVarMapping.server.pauseBetweenClicks], "number") as number) ||
        defaultConfig.server.pauseBetweenClicks,
      environment:
        (parseEnvVar(
          envSource[envVarMapping.server.environment],
          "string"
        ) as Config["server"]["environment"]) || defaultConfig.server.environment,
      department:
        (parseEnvVar(envSource[envVarMapping.server.department], "string") as string) ||
        defaultConfig.server.department,
      departmentShort: (
        (parseEnvVar(envSource[envVarMapping.server.departmentShort], "string") as string) ||
        defaultConfig.server.departmentShort
      ).toUpperCase(),
      domain:
        (parseEnvVar(envSource[envVarMapping.server.domain], "string") as string) ||
        defaultConfig.server.domain,
      service:
        (parseEnvVar(envSource[envVarMapping.server.service], "string") as string) ||
        defaultConfig.server.service,
      journeyType:
        (parseEnvVar(envSource[envVarMapping.server.journeyType], "string") as string) ||
        defaultConfig.server.journeyType,
    },
    browser: {
      headless:
        (parseEnvVar(envSource[envVarMapping.browser.headless], "boolean") as boolean) ??
        defaultConfig.browser.headless,
      viewport: {
        width:
          (parseEnvVar(envSource[envVarMapping.browser["viewport.width"]], "number") as number) ||
          defaultConfig.browser.viewport.width,
        height:
          (parseEnvVar(envSource[envVarMapping.browser["viewport.height"]], "number") as number) ||
          defaultConfig.browser.viewport.height,
      },
      ignoreHTTPSErrors:
        (parseEnvVar(envSource[envVarMapping.browser.ignoreHTTPSErrors], "boolean") as boolean) ??
        defaultConfig.browser.ignoreHTTPSErrors,
      screenshot:
        (parseEnvVar(
          envSource[envVarMapping.browser.screenshot],
          "string"
        ) as Config["browser"]["screenshot"]) || defaultConfig.browser.screenshot,
      video:
        (parseEnvVar(
          envSource[envVarMapping.browser.video],
          "string"
        ) as Config["browser"]["video"]) || defaultConfig.browser.video,
      trace:
        (parseEnvVar(
          envSource[envVarMapping.browser.trace],
          "string"
        ) as Config["browser"]["trace"]) || defaultConfig.browser.trace,
    },
    allowedDownloads: {
      ...defaultConfig.allowedDownloads,
      extensions: defaultConfig.allowedDownloads.extensions.map((ext) => ext.toLowerCase()),
      maxFileSize:
        (parseEnvVar(envSource[envVarMapping.allowedDownloads.maxFileSize], "number") as number) ||
        defaultConfig.allowedDownloads.maxFileSize,
      maxImagesToValidate:
        (parseEnvVar(
          envSource[envVarMapping.allowedDownloads.maxImagesToValidate],
          "number"
        ) as number) || defaultConfig.allowedDownloads.maxImagesToValidate,
      maxVideosToValidate:
        (parseEnvVar(
          envSource[envVarMapping.allowedDownloads.maxVideosToValidate],
          "number"
        ) as number) || defaultConfig.allowedDownloads.maxVideosToValidate,
      validateAssetImages:
        (parseEnvVar(
          envSource[envVarMapping.allowedDownloads.validateAssetImages],
          "boolean"
        ) as boolean) ?? defaultConfig.allowedDownloads.validateAssetImages,
    },
  };
}

// Pillar 4: Configuration Initialization
function initializeConfig(): Config {
  try {
    const envConfig = loadConfigFromEnv();

    const mergedConfig = {
      server: {
        ...defaultConfig.server,
        ...envConfig.server,
        // Ensure directories exist during merge
        screenshotDir: ensureDirectoryExists(
          envConfig.server?.screenshotDir || defaultConfig.server.screenshotDir
        ),
        downloadsDir: ensureDirectoryExists(
          envConfig.server?.downloadsDir || defaultConfig.server.downloadsDir
        ),
        syntheticsDir: ensureDirectoryExists(
          envConfig.server?.syntheticsDir || defaultConfig.server.syntheticsDir
        ),
      },
      browser: {
        ...defaultConfig.browser,
        ...envConfig.browser,
        viewport: {
          ...defaultConfig.browser.viewport,
          ...envConfig.browser?.viewport,
        },
      },
      allowedDownloads: {
        ...defaultConfig.allowedDownloads,
        ...envConfig.allowedDownloads,
      },
    };

    const result = ConfigSchema.safeParse(mergedConfig);

    if (!result.success) {
      console.error("Configuration validation failed:");
      const prettyError = z.prettifyError(result.error);
      console.error(prettyError);

      const issues = result.error.issues
        .map((issue) => {
          const path = issue.path.length > 0 ? issue.path.join(".") : "root";
          return `  - ${path}: ${issue.message}`;
        })
        .join("\n");

      throw new Error(
        `Invalid configuration:\n${issues}\n\nPlease check your environment variables and default configuration.`
      );
    }

    console.log("Configuration loaded successfully");
    console.log(`  Environment: ${result.data.server.environment}`);
    console.log(`  Base URL: ${result.data.server.baseUrl}`);
    console.log(`  Headless: ${result.data.browser.headless}`);

    return result.data;
  } catch (error) {
    console.error("Configuration initialization failed:", error);
    throw error;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Configuration Instance
export const config = initializeConfig();

// Re-export Schema Registry and Types
export { SchemaRegistry };
export type {
  Config,
  ServerConfig,
  BrowserConfig,
  DownloadConfig,
  ElementCounts,
  BrokenLink,
  BrokenLinksReport,
  NavigationPath,
  SkippedDownload,
};

// Utility Functions
export const getConfigJSONSchema = () => ConfigSchema;

export const validateConfiguration = (data: unknown) => {
  const result = ConfigSchema.safeParse(data);
  if (!result.success) {
    throw new Error(JSON.stringify(result.error.issues, null, 2));
  }
  return result.data;
};
