/* config.ts */

import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";
import { z } from "zod";

if (typeof Bun === "undefined") {
  dotenv.config();
}
const EnvironmentType = z.enum([
  "development",
  "staging",
  "production",
  "test",
]);
const ScreenshotMode = z.enum(["on", "off", "only-on-failure"]);
const VideoMode = z.enum(["on", "off", "retain-on-failure"]);
const TraceMode = z.enum(["on", "off", "retain-on-failure"]);

const DirectoryPath = z
  .string()
  .refine(
    (val) => {
      return (
        val.startsWith("./") || val.startsWith("/") || val.startsWith("../")
      );
    },
    { message: "Directory path must be relative (./) or absolute (/)" },
  )
  .transform((val) => {
    const fullPath = path.resolve(val);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    return val;
  });

const HttpsUrl = z
  .url()
  .refine((url) => url.startsWith("https://") || url.startsWith("http://"), {
    message: "URL must use HTTP or HTTPS protocol",
  });

const PositiveInt = z
  .int32()
  .positive({ message: "Must be a positive integer" });

const FileSizeBytes = z
  .number()
  .int()
  .min(1024, { message: "Minimum file size is 1KB" })
  .max(1073741824, { message: "Maximum file size is 1GB" });

const Milliseconds = z
  .int32()
  .min(0, { message: "Timeout must be non-negative" });

const ServerConfigSchema = z
  .object({
    baseUrl: HttpsUrl,
    screenshotDir: DirectoryPath,
    downloadsDir: DirectoryPath,
    syntheticsDir: DirectoryPath,
    pauseBetweenClicks: Milliseconds.min(100).max(10000),
    environment: EnvironmentType,
    department: z.string().min(1).max(50),
    departmentShort: z
      .string()
      .min(1)
      .max(10)
      .transform((val) => val.toUpperCase()),
    domain: z
      .string()
      .regex(/^[a-z0-9-]+$/, "Domain must be lowercase with hyphens only"),
    service: z.string().min(1).max(50),
    journeyType: z.string().min(1).max(50),
  })
  .strict();

const BrowserConfigSchema = z
  .object({
    headless: z.boolean(),
    viewport: z
      .object({
        width: PositiveInt.min(320).max(3840),
        height: PositiveInt.min(240).max(2160),
      })
      .refine((viewport) => viewport.width >= viewport.height * 0.5, {
        message:
          "Viewport aspect ratio should be reasonable (width >= height * 0.5)",
      }),
    ignoreHTTPSErrors: z.boolean(),
    screenshot: ScreenshotMode,
    video: VideoMode,
    trace: TraceMode,
  })
  .strict();

const FileExtension = z
  .string()
  .regex(
    /^\.[a-z0-9]+$/i,
    "Extension must start with . and contain only alphanumeric characters",
  )
  .transform((val) => val.toLowerCase());

const MimeType = z
  .string()
  .regex(/^[a-z]+\/[a-z0-9.+-]+$/i, "Invalid MIME type format");

const DownloadConfigSchema = z
  .object({
    extensions: z
      .array(FileExtension)
      .min(1, "At least one file extension must be specified"),

    maxFileSize: FileSizeBytes,

    allowedMimeTypes: z
      .array(MimeType)
      .min(1, "At least one MIME type must be specified"),

    downloadTimeout: Milliseconds.min(5000).max(300000),
    maxRetries: PositiveInt.max(10),
    retryDelay: Milliseconds.min(500).max(30000),

    validateAssetImages: z.boolean(),
    downloadSampleAssets: z.boolean(),
    maxSampleAssets: PositiveInt.max(100),
    maxImagesToValidate: PositiveInt.max(1000),
    maxVideosToValidate: PositiveInt.max(500),
  })
  .refine(
    (data) => {
      if (data.downloadSampleAssets && data.maxSampleAssets > 20) {
        return false;
      }
      return true;
    },
    {
      message:
        "When downloading sample assets, maxSampleAssets should not exceed 20",
      path: ["maxSampleAssets"],
    },
  );

const ConfigSchema = z
  .object({
    server: ServerConfigSchema,
    browser: BrowserConfigSchema,
    allowedDownloads: DownloadConfigSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.browser.headless &&
      (data.browser.video === "on" || data.browser.screenshot === "on")
    ) {
      console.warn(
        "Warning: Video/Screenshot recording in headless mode may not work as expected",
      );
    }

    const paths = [
      data.server.screenshotDir,
      data.server.downloadsDir,
      data.server.syntheticsDir,
    ];
    const uniquePaths = new Set(paths.map((p) => path.resolve(p)));
    if (uniquePaths.size !== paths.length) {
      ctx.addIssue({
        code: "custom",
        message:
          "Screenshot, downloads, and synthetics directories must be different",
      });
    }
  });

type Config = z.infer<typeof ConfigSchema>;

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
    baseUrl:
      "https://www.prd.presskits.eu.pvh.cloud/tommyxmercedes-amgf1xclarenceruth/",
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

const EnvString = z.string().trim();
const EnvNumber = z.coerce.number();
const EnvBoolean = z.stringbool();

const EnvConfigSchema = z
  .object({
    BASE_URL: z.url().optional(),
    SCREENSHOT_DIR: DirectoryPath.optional(),
    DOWNLOADS_DIR: DirectoryPath.optional(),
    SYNTHETICS_DIR: DirectoryPath.optional(),
    PAUSE_BETWEEN_CLICKS: z.coerce.number().int().min(0).optional(),
    ENVIRONMENT: EnvironmentType.optional(),
    DEPARTMENT: EnvString.optional(),
    DEPARTMENT_SHORT: z
      .string()
      .trim()
      .transform((val) => val.toUpperCase())
      .optional(),
    DOMAIN: EnvString.optional(),
    SERVICE: EnvString.optional(),
    JOURNEY_TYPE: EnvString.optional(),
    BROWSER_HEADLESS: EnvBoolean.optional(),
    VIEWPORT_WIDTH: z.coerce.number().int().positive().optional(),
    VIEWPORT_HEIGHT: z.coerce.number().int().positive().optional(),
    IGNORE_HTTPS_ERRORS: EnvBoolean.optional(),
    SCREENSHOT_MODE: ScreenshotMode.optional(),
    VIDEO_MODE: VideoMode.optional(),
    TRACE_MODE: TraceMode.optional(),
    MAX_DOWNLOAD_SIZE: z.coerce
      .number()
      .int()
      .min(1024)
      .max(1073741824)
      .optional(),
    MAX_IMAGES_TO_VALIDATE: z.coerce.number().int().positive().optional(),
    MAX_VIDEOS_TO_VALIDATE: z.coerce.number().int().positive().optional(),
    VALIDATE_ASSET_IMAGES: EnvBoolean.optional(),
    DOWNLOAD_TIMEOUT: z.coerce.number().int().min(0).optional(),
    MAX_RETRIES: z.coerce.number().int().positive().optional(),
    RETRY_DELAY: z.coerce.number().int().min(0).optional(),
  });

function loadConfigFromEnv(): Partial<Config> {
  const envSource = typeof Bun !== "undefined" ? Bun.env : process.env;

  const envResult = EnvConfigSchema.safeParse(envSource);

  if (!envResult.success) {
    console.warn(
      "Environment variable validation warnings:",
      envResult.error.issues,
    );
  }

  const env = envResult.data || {};

  const config: Partial<Config> = {
    server: {
      ...defaultConfig.server,
      ...(env.BASE_URL && { baseUrl: env.BASE_URL }),
      ...(env.SCREENSHOT_DIR && { screenshotDir: env.SCREENSHOT_DIR }),
      ...(env.DOWNLOADS_DIR && { downloadsDir: env.DOWNLOADS_DIR }),
      ...(env.SYNTHETICS_DIR && { syntheticsDir: env.SYNTHETICS_DIR }),
      ...(env.PAUSE_BETWEEN_CLICKS !== undefined && {
        pauseBetweenClicks: env.PAUSE_BETWEEN_CLICKS,
      }),
      ...(env.ENVIRONMENT && { environment: env.ENVIRONMENT }),
      ...(env.DEPARTMENT && { department: env.DEPARTMENT }),
      ...(env.DEPARTMENT_SHORT && { departmentShort: env.DEPARTMENT_SHORT }),
      ...(env.DOMAIN && { domain: env.DOMAIN }),
      ...(env.SERVICE && { service: env.SERVICE }),
      ...(env.JOURNEY_TYPE && { journeyType: env.JOURNEY_TYPE }),
    },
    browser: {
      ...defaultConfig.browser,
      ...(env.BROWSER_HEADLESS !== undefined && {
        headless: env.BROWSER_HEADLESS,
      }),
      viewport: {
        width: env.VIEWPORT_WIDTH || defaultConfig.browser.viewport.width,
        height: env.VIEWPORT_HEIGHT || defaultConfig.browser.viewport.height,
      },
      ...(env.IGNORE_HTTPS_ERRORS !== undefined && {
        ignoreHTTPSErrors: env.IGNORE_HTTPS_ERRORS,
      }),
      ...(env.SCREENSHOT_MODE && { screenshot: env.SCREENSHOT_MODE }),
      ...(env.VIDEO_MODE && { video: env.VIDEO_MODE }),
      ...(env.TRACE_MODE && { trace: env.TRACE_MODE }),
    },
    allowedDownloads: {
      ...defaultConfig.allowedDownloads,
      ...(env.MAX_DOWNLOAD_SIZE !== undefined && {
        maxFileSize: env.MAX_DOWNLOAD_SIZE,
      }),
      ...(env.MAX_IMAGES_TO_VALIDATE !== undefined && {
        maxImagesToValidate: env.MAX_IMAGES_TO_VALIDATE,
      }),
      ...(env.MAX_VIDEOS_TO_VALIDATE !== undefined && {
        maxVideosToValidate: env.MAX_VIDEOS_TO_VALIDATE,
      }),
      ...(env.VALIDATE_ASSET_IMAGES !== undefined && {
        validateAssetImages: env.VALIDATE_ASSET_IMAGES,
      }),
      ...(env.DOWNLOAD_TIMEOUT !== undefined && {
        downloadTimeout: env.DOWNLOAD_TIMEOUT,
      }),
      ...(env.MAX_RETRIES !== undefined && { maxRetries: env.MAX_RETRIES }),
      ...(env.RETRY_DELAY !== undefined && { retryDelay: env.RETRY_DELAY }),
    },
  };

  return config;
}

function initializeConfig(): Config {
  try {
    const envConfig = loadConfigFromEnv();

    const mergedConfig = {
      server: { ...defaultConfig.server, ...envConfig.server },
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
      console.error(JSON.stringify(result.error.issues, null, 2));

      const issues = result.error.issues
        .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
        .join("\n");

      throw new Error(`Invalid configuration:\n${issues}`);
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

export const config = initializeConfig();
export { SchemaRegistry };
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type BrowserConfig = z.infer<typeof BrowserConfigSchema>;
export type DownloadConfig = z.infer<typeof DownloadConfigSchema>;

