/* config.ts - Enhanced with Zod v4 features */

import { z } from "zod";
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config();

// Zod v4 feature: Custom error messages with improved error handling
const customErrorMap: z.ZodErrorMap = (issue, ctx) => {
  if (issue.code === z.ZodIssueCode.invalid_type) {
    return { message: `Expected ${issue.expected}, received ${issue.received}` };
  }
  if (issue.code === z.ZodIssueCode.invalid_literal) {
    return { message: `Invalid value. Must be ${JSON.stringify(issue.expected)}` };
  }
  return { message: ctx.defaultError };
};

z.setErrorMap(customErrorMap);

// Zod v4 feature: Template literal types for better string validation
const EnvironmentType = z.enum(["development", "staging", "production", "test"]);
const ScreenshotMode = z.enum(["on", "off", "only-on-failure"]);
const VideoMode = z.enum(["on", "off", "retain-on-failure"]);
const TraceMode = z.enum(["on", "off", "retain-on-failure"]);

// Zod v4 feature: Custom validators with metadata
const DirectoryPath = z.string()
  .describe("Path to a directory")
  .refine(
    (val) => {
      // Validate directory path format
      return val.startsWith('./') || val.startsWith('/') || val.startsWith('../');
    },
    { message: "Directory path must be relative (./) or absolute (/)" }
  )
  .transform((val) => {
    // Ensure directory exists or can be created
    const fullPath = path.resolve(val);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    return val;
  });

// Zod v4 feature: URL with format validation
const HttpsUrl = z.string()
  .url({ message: "Must be a valid URL" })
  .startsWith("https://", { message: "URL must use HTTPS protocol" })
  .or(z.string().url().startsWith("http://"));

// Zod v4 feature: Numeric formats for better type safety
const PositiveInt = z.number()
  .int({ message: "Must be an integer" })
  .positive({ message: "Must be a positive number" });

const FileSizeBytes = z.number()
  .int()
  .min(1024, { message: "Minimum file size is 1KB" })
  .max(1073741824, { message: "Maximum file size is 1GB" }); // 1GB max

const Milliseconds = z.number()
  .int()
  .min(0, { message: "Timeout must be non-negative" })
  .describe("Duration in milliseconds");

// Enhanced server configuration with Zod v4 features
const ServerConfigSchema = z.object({
  baseUrl: HttpsUrl,
  screenshotDir: DirectoryPath,
  downloadsDir: DirectoryPath,
  syntheticsDir: DirectoryPath,
  pauseBetweenClicks: Milliseconds.min(100).max(10000),
  environment: EnvironmentType,
  department: z.string().min(1).max(50),
  departmentShort: z.string().min(1).max(10).toUpperCase(),
  domain: z.string().regex(/^[a-z0-9-]+$/, "Domain must be lowercase with hyphens only"),
  service: z.string().min(1).max(50),
  journeyType: z.string().min(1).max(50),
})
.describe("Server configuration settings")
.strict();

// Enhanced browser configuration
const BrowserConfigSchema = z.object({
  headless: z.boolean(),
  viewport: z.object({
    width: PositiveInt.min(320).max(3840),
    height: PositiveInt.min(240).max(2160),
  })
  .refine(
    (viewport) => viewport.width >= viewport.height * 0.5,
    { message: "Viewport aspect ratio should be reasonable (width >= height * 0.5)" }
  ),
  ignoreHTTPSErrors: z.boolean(),
  screenshot: ScreenshotMode,
  video: VideoMode,
  trace: TraceMode,
})
.describe("Browser automation settings")
.strict();

// Zod v4 feature: Complex validation with cross-field dependencies
const FileExtension = z.string()
  .regex(/^\.[a-z0-9]+$/i, "Extension must start with . and contain only alphanumeric characters")
  .toLowerCase();

const MimeType = z.string()
  .regex(/^[a-z]+\/[a-z0-9.+-]+$/i, "Invalid MIME type format");

const DownloadConfigSchema = z.object({
  extensions: z.array(FileExtension)
    .min(1, "At least one file extension must be specified")
    .describe("Allowed file extensions for downloads"),
  
  maxFileSize: FileSizeBytes,
  
  allowedMimeTypes: z.array(MimeType)
    .min(1, "At least one MIME type must be specified"),
  
  downloadTimeout: Milliseconds.min(5000).max(300000),
  maxRetries: PositiveInt.max(10),
  retryDelay: Milliseconds.min(500).max(30000),
  
  // Optional fields with defaults
  validateAssetImages: z.boolean().default(true),
  downloadSampleAssets: z.boolean().default(false),
  maxSampleAssets: PositiveInt.max(100).default(5),
  maxImagesToValidate: PositiveInt.max(1000).default(200),
  maxVideosToValidate: PositiveInt.max(500).default(50),
})
.describe("Download and asset validation settings")
.refine(
  (data) => {
    // Cross-field validation: if downloading samples, ensure sample count is reasonable
    if (data.downloadSampleAssets && data.maxSampleAssets > 20) {
      return false;
    }
    return true;
  },
  { 
    message: "When downloading sample assets, maxSampleAssets should not exceed 20",
    path: ["maxSampleAssets"]
  }
);

// Zod v4 feature: Schema composition with metadata
const ConfigSchema = z.object({
  server: ServerConfigSchema,
  browser: BrowserConfigSchema,
  allowedDownloads: DownloadConfigSchema,
})
.describe("Complete application configuration")
.strict()
.superRefine((data, ctx) => {
  // Advanced cross-schema validation
  if (data.browser.headless && (data.browser.video === "on" || data.browser.screenshot === "on")) {
    console.warn("Warning: Video/Screenshot recording in headless mode may not work as expected");
  }
  
  // Validate paths don't overlap
  const paths = [data.server.screenshotDir, data.server.downloadsDir, data.server.syntheticsDir];
  const uniquePaths = new Set(paths.map(p => path.resolve(p)));
  if (uniquePaths.size !== paths.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Screenshot, downloads, and synthetics directories must be different",
    });
  }
});

// Zod v4 feature: Type inference with better performance
type Config = z.infer<typeof ConfigSchema>;

// Zod v4 feature: Schema registry for reusability
const SchemaRegistry = {
  Server: ServerConfigSchema,
  Browser: BrowserConfigSchema,
  Download: DownloadConfigSchema,
  Config: ConfigSchema,
} as const;

// Enhanced allowedDownloads configuration with comprehensive press kit support
const enhancedAllowedDownloads = {
  extensions: [
    // Archives
    ".pdf", ".zip", ".rar", ".7z",
    
    // Documents  
    ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".rtf",
    
    // Images
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".tiff",
    
    // Media
    ".mp4", ".mov", ".avi", ".wmv", ".mp3", ".wav", ".m4v", ".webm",
    
    // Design files (common in press kits)
    ".psd", ".ai", ".eps", ".indd", ".sketch"
  ],
  
  allowedMimeTypes: [
    // Documents
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "text/plain",
    
    // Archives
    "application/zip",
    "application/x-zip-compressed",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
    
    // Images
    "image/jpeg",
    "image/png", 
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/bmp",
    "image/tiff",
    
    // Media
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "audio/mpeg",
    "audio/wav",
    "video/webm",
    
    // Generic (for when servers don't set proper MIME types)
    "application/octet-stream"
  ],
  
  maxFileSize: 104857600, // 100MB - good for press kit files
  
  // Additional settings for press kits
  downloadTimeout: 60000, // 60 seconds
  maxRetries: 3,
  retryDelay: 2000, // 2 seconds between retries
  
  // Asset validation settings
  validateAssetImages: true, // Check if asset images are accessible
  downloadSampleAssets: false, // Download sample assets for verification
  maxSampleAssets: 5, // Maximum number of sample assets to download
  maxImagesToValidate: 200, // Maximum number of images to validate
  maxVideosToValidate: 50 // Maximum number of videos to validate
};

// Zod v4 feature: Default configuration with validation
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
    maxVideosToValidate: enhancedAllowedDownloads.maxVideosToValidate
  }
};

// Environment variable mapping
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
};

// Zod v4 feature: Enhanced coercion with stringbool support
const EnvString = z.string().trim();
const EnvNumber = z.coerce.number();
const EnvBoolean = z.enum(["true", "false", "1", "0", "yes", "no"])
  .transform(val => val === "true" || val === "1" || val === "yes");
const EnvArray = z.string()
  .transform(val => val.split(",").map(item => item.trim()).filter(Boolean));

// Zod v4 feature: Environment variable schema with coercion
const EnvConfigSchema = z.object({
  // Server environment variables
  BASE_URL: HttpsUrl.optional(),
  SCREENSHOT_DIR: DirectoryPath.optional(),
  DOWNLOADS_DIR: DirectoryPath.optional(),
  SYNTHETICS_DIR: DirectoryPath.optional(),
  PAUSE_BETWEEN_CLICKS: EnvNumber.pipe(Milliseconds).optional(),
  ENVIRONMENT: EnvironmentType.optional(),
  DEPARTMENT: EnvString.optional(),
  DEPARTMENT_SHORT: EnvString.pipe(z.string().toUpperCase()).optional(),
  DOMAIN: EnvString.optional(),
  SERVICE: EnvString.optional(),
  JOURNEY_TYPE: EnvString.optional(),
  
  // Browser environment variables
  BROWSER_HEADLESS: EnvBoolean.optional(),
  VIEWPORT_WIDTH: EnvNumber.pipe(PositiveInt).optional(),
  VIEWPORT_HEIGHT: EnvNumber.pipe(PositiveInt).optional(),
  IGNORE_HTTPS_ERRORS: EnvBoolean.optional(),
  SCREENSHOT_MODE: ScreenshotMode.optional(),
  VIDEO_MODE: VideoMode.optional(),
  TRACE_MODE: TraceMode.optional(),
  
  // Download environment variables
  MAX_DOWNLOAD_SIZE: EnvNumber.pipe(FileSizeBytes).optional(),
  MAX_IMAGES_TO_VALIDATE: EnvNumber.pipe(PositiveInt).optional(),
  MAX_VIDEOS_TO_VALIDATE: EnvNumber.pipe(PositiveInt).optional(),
  VALIDATE_ASSET_IMAGES: EnvBoolean.optional(),
  DOWNLOAD_TIMEOUT: EnvNumber.pipe(Milliseconds).optional(),
  MAX_RETRIES: EnvNumber.pipe(PositiveInt).optional(),
  RETRY_DELAY: EnvNumber.pipe(Milliseconds).optional(),
})
.passthrough(); // Allow other env vars to pass through

// Zod v4 feature: Simplified environment loading with validation
function loadConfigFromEnv(): Partial<Config> {
  // Parse environment variables with Zod v4 coercion
  const envResult = EnvConfigSchema.safeParse(process.env);
  
  if (!envResult.success) {
    console.warn("Environment variable validation warnings:", envResult.error.format());
  }
  
  const env = envResult.data || {};
  
  // Build config from environment with type safety
  const config: Partial<Config> = {
    server: {
      ...defaultConfig.server,
      ...(env.BASE_URL && { baseUrl: env.BASE_URL }),
      ...(env.SCREENSHOT_DIR && { screenshotDir: env.SCREENSHOT_DIR }),
      ...(env.DOWNLOADS_DIR && { downloadsDir: env.DOWNLOADS_DIR }),
      ...(env.SYNTHETICS_DIR && { syntheticsDir: env.SYNTHETICS_DIR }),
      ...(env.PAUSE_BETWEEN_CLICKS !== undefined && { pauseBetweenClicks: env.PAUSE_BETWEEN_CLICKS }),
      ...(env.ENVIRONMENT && { environment: env.ENVIRONMENT }),
      ...(env.DEPARTMENT && { department: env.DEPARTMENT }),
      ...(env.DEPARTMENT_SHORT && { departmentShort: env.DEPARTMENT_SHORT }),
      ...(env.DOMAIN && { domain: env.DOMAIN }),
      ...(env.SERVICE && { service: env.SERVICE }),
      ...(env.JOURNEY_TYPE && { journeyType: env.JOURNEY_TYPE }),
    },
    browser: {
      ...defaultConfig.browser,
      ...(env.BROWSER_HEADLESS !== undefined && { headless: env.BROWSER_HEADLESS }),
      viewport: {
        width: env.VIEWPORT_WIDTH || defaultConfig.browser.viewport.width,
        height: env.VIEWPORT_HEIGHT || defaultConfig.browser.viewport.height,
      },
      ...(env.IGNORE_HTTPS_ERRORS !== undefined && { ignoreHTTPSErrors: env.IGNORE_HTTPS_ERRORS }),
      ...(env.SCREENSHOT_MODE && { screenshot: env.SCREENSHOT_MODE }),
      ...(env.VIDEO_MODE && { video: env.VIDEO_MODE }),
      ...(env.TRACE_MODE && { trace: env.TRACE_MODE }),
    },
    allowedDownloads: {
      ...defaultConfig.allowedDownloads,
      ...(env.MAX_DOWNLOAD_SIZE !== undefined && { maxFileSize: env.MAX_DOWNLOAD_SIZE }),
      ...(env.MAX_IMAGES_TO_VALIDATE !== undefined && { maxImagesToValidate: env.MAX_IMAGES_TO_VALIDATE }),
      ...(env.MAX_VIDEOS_TO_VALIDATE !== undefined && { maxVideosToValidate: env.MAX_VIDEOS_TO_VALIDATE }),
      ...(env.VALIDATE_ASSET_IMAGES !== undefined && { validateAssetImages: env.VALIDATE_ASSET_IMAGES }),
      ...(env.DOWNLOAD_TIMEOUT !== undefined && { downloadTimeout: env.DOWNLOAD_TIMEOUT }),
      ...(env.MAX_RETRIES !== undefined && { maxRetries: env.MAX_RETRIES }),
      ...(env.RETRY_DELAY !== undefined && { retryDelay: env.RETRY_DELAY }),
    }
  };

  return config;
}

// Zod v4 feature: Enhanced error reporting and validation
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
          ...envConfig.browser?.viewport 
        } 
      },
      allowedDownloads: { ...defaultConfig.allowedDownloads, ...envConfig.allowedDownloads }
    };

    // Zod v4 feature: Parse with detailed error reporting
    const result = ConfigSchema.safeParse(mergedConfig);
    
    if (!result.success) {
      // Enhanced error formatting
      const formatted = result.error.format();
      console.error("Configuration validation failed:");
      console.error(JSON.stringify(formatted, null, 2));
      
      // Provide helpful error messages
      const issues = result.error.issues.map(issue => 
        `  - ${issue.path.join('.')}: ${issue.message}`
      ).join('\n');
      
      throw new Error(`Invalid configuration:\n${issues}`);
    }
    
    // Log successful configuration with metadata
    console.log("✅ Configuration loaded successfully");
    console.log(`  Environment: ${result.data.server.environment}`);
    console.log(`  Base URL: ${result.data.server.baseUrl}`);
    console.log(`  Headless: ${result.data.browser.headless}`);
    
    return result.data;
  } catch (error) {
    console.error("❌ Configuration initialization failed:", error);
    throw error;
  }
}

// Zod v4 feature: Export validated configuration with type safety
export const config = initializeConfig();

// Export schema registry for testing and validation
export { SchemaRegistry };

// Zod v4 feature: Export type utilities
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type BrowserConfig = z.infer<typeof BrowserConfigSchema>;
export type DownloadConfig = z.infer<typeof DownloadConfigSchema>; 