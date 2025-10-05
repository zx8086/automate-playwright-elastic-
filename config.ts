/* config.ts */

import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";
import { z } from "zod";

if (typeof Bun === "undefined") {
  dotenv.config();
}
const EnvironmentType = z.enum(["development", "staging", "production", "test"]);
const ScreenshotMode = z.enum(["on", "off", "only-on-failure"]);
const VideoMode = z.enum(["on", "off", "retain-on-failure"]);
const TraceMode = z.enum(["on", "off", "retain-on-failure"]);

const DirectoryPath = z
  .string()
  .refine((val) => val.startsWith("./") || val.startsWith("/") || val.startsWith("../"), {
    message: "Directory path must be relative (./) or absolute (/)",
  });

// Directory creation moved to separate utility function
function ensureDirectoryExists(dirPath: string): string {
  const fullPath = path.resolve(dirPath);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
  return dirPath;
}

const HttpsUrl = z.url();
const PositiveInt = z.int32().min(1);
const FileSizeBytes = z.int32().min(1);
const Milliseconds = z.int32().min(0);

const ServerConfigSchema = z.strictObject({
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

const BrowserConfigSchema = z.strictObject({
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

const FileExtension = z.string();

const MimeType = z.string().superRefine((val, ctx) => {
  const mimePattern = /^[a-z]+\/[a-z0-9.+-]+$/i;
  if (!mimePattern.test(val)) {
    ctx.addIssue({
      code: "custom",
      message: "Invalid MIME type format",
    });
    return;
  }
});

const DownloadConfigSchema = z.strictObject({
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

const ConfigSchema = z
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

const SchemaRegistry = {
  Server: ServerConfigSchema,
  Browser: BrowserConfigSchema,
  Download: DownloadConfigSchema,
  Config: ConfigSchema,
} as const;

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

// Environment variable mapping follows 4-pillar pattern - no validation here, only mapping

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

// Pillar 3: Manual Configuration Loading with Bun.env optimization
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

// Pillar 4: Configuration Initialization with Directory Creation
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

// Export validated configuration instance
export const config = initializeConfig();

// Export schema registry for metadata access
export { SchemaRegistry };

// Export type definitions
export type Config = z.infer<typeof ConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type BrowserConfig = z.infer<typeof BrowserConfigSchema>;
export type DownloadConfig = z.infer<typeof DownloadConfigSchema>;

// Export JSON Schema generation utility (simplified for Zod v4 compatibility)
export const getConfigJSONSchema = () => ConfigSchema;

// Export configuration validation utility
export const validateConfiguration = (data: unknown) => {
  const result = ConfigSchema.safeParse(data);
  if (!result.success) {
    throw new Error(JSON.stringify(result.error.issues, null, 2));
  }
  return result.data;
};
