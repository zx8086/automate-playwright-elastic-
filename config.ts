/* config.ts */

import { z } from "zod";

// Define configuration schemas using Zod
const ServerConfigSchema = z.object({
  baseUrl: z.string().url(),
  screenshotDir: z.string(),
  downloadsDir: z.string(),
  syntheticsDir: z.string(),
  pauseBetweenClicks: z.number(),
  environment: z.string(),
  department: z.string(),
  departmentShort: z.string(),
  domain: z.string(),
  service: z.string(),
  journeyType: z.string(),
});

const BrowserConfigSchema = z.object({
  headless: z.boolean(),
  viewport: z.object({
    width: z.number(),
    height: z.number(),
  }),
  ignoreHTTPSErrors: z.boolean(),
  screenshot: z.enum(["on", "off", "only-on-failure"]),
  video: z.enum(["on", "off", "retain-on-failure"]),
  trace: z.enum(["on", "off", "retain-on-failure"]),
});

const DownloadConfigSchema = z.object({
  extensions: z.array(z.string()),
  maxFileSize: z.number(),
  allowedMimeTypes: z.array(z.string()),
});

const ConfigSchema = z.object({
  server: ServerConfigSchema,
  browser: BrowserConfigSchema,
  allowedDownloads: DownloadConfigSchema,
});

type Config = z.infer<typeof ConfigSchema>;

// Default configuration
const defaultConfig: Config = {
  server: {
    baseUrl: "https://presskit.tommy.com/SP25TommyHilfigerSailing/",
    screenshotDir: "./navigation-screenshots",
    downloadsDir: "./downloads",
    syntheticsDir: "./synthetics",
    pauseBetweenClicks: 1000,
    environment: "production",
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
    extensions: [".pdf", ".zip", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".jpg", ".jpeg", ".png", ".mp4", ".mp3"],
    maxFileSize: 100 * 1024 * 1024,
    allowedMimeTypes: ["application/pdf", "application/zip", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv", "image/jpeg", "image/png", "video/mp4", "audio/mpeg"]
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
  },
};

// Helper function to parse environment variables
const parseEnvVar = (value: string | undefined, type: "string" | "number" | "boolean" | "array"): any => {
  if (value === undefined) return undefined;
  if (type === "number") return Number(value);
  if (type === "boolean") return value.toLowerCase() === "true";
  if (type === "array") return value.split(",").map(item => item.trim());
  return value;
};

// Load configuration from environment variables
function loadConfigFromEnv(): Partial<Config> {
  const config: Partial<Config> = {
    server: {
      baseUrl: defaultConfig.server.baseUrl,
      screenshotDir: defaultConfig.server.screenshotDir,
      downloadsDir: defaultConfig.server.downloadsDir,
      syntheticsDir: defaultConfig.server.syntheticsDir,
      pauseBetweenClicks: defaultConfig.server.pauseBetweenClicks,
      environment: defaultConfig.server.environment,
      department: defaultConfig.server.department,
      departmentShort: defaultConfig.server.departmentShort,
      domain: defaultConfig.server.domain,
      service: defaultConfig.server.service,
      journeyType: defaultConfig.server.journeyType,
    },
    browser: {
      headless: defaultConfig.browser.headless,
      viewport: {
        width: defaultConfig.browser.viewport.width,
        height: defaultConfig.browser.viewport.height,
      },
      ignoreHTTPSErrors: defaultConfig.browser.ignoreHTTPSErrors,
      screenshot: defaultConfig.browser.screenshot,
      video: defaultConfig.browser.video,
      trace: defaultConfig.browser.trace,
    },
    allowedDownloads: {
      extensions: [...defaultConfig.allowedDownloads.extensions],
      maxFileSize: defaultConfig.allowedDownloads.maxFileSize,
      allowedMimeTypes: [...defaultConfig.allowedDownloads.allowedMimeTypes],
    }
  };

  // Load server config
  Object.entries(envVarMapping.server).forEach(([key, envVar]) => {
    const value = process.env[envVar];
    if (value !== undefined && config.server) {
      const type = typeof defaultConfig.server[key as keyof typeof defaultConfig.server];
      (config.server as any)[key] = parseEnvVar(value, type as "string" | "number" | "boolean" | "array");
    }
  });

  // Load browser config
  Object.entries(envVarMapping.browser).forEach(([key, envVar]) => {
    const value = process.env[envVar];
    if (value !== undefined && config.browser) {
      if (key === "viewport.width" && config.browser.viewport) {
        config.browser.viewport.width = parseEnvVar(value, "number");
      } else if (key === "viewport.height" && config.browser.viewport) {
        config.browser.viewport.height = parseEnvVar(value, "number");
      } else {
        const type = typeof defaultConfig.browser[key as keyof typeof defaultConfig.browser];
        (config.browser as any)[key] = parseEnvVar(value, type as "string" | "number" | "boolean" | "array");
      }
    }
  });

  // Load downloads config
  Object.entries(envVarMapping.allowedDownloads).forEach(([key, envVar]) => {
    const value = process.env[envVar];
    if (value !== undefined && config.allowedDownloads) {
      const type = typeof defaultConfig.allowedDownloads[key as keyof typeof defaultConfig.allowedDownloads];
      (config.allowedDownloads as any)[key] = parseEnvVar(value, type as "string" | "number" | "boolean" | "array");
    }
  });

  return config;
}

// Initialize and validate configuration
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

    return ConfigSchema.parse(mergedConfig);
  } catch (error) {
    console.error("Configuration validation failed:", error instanceof Error ? error.message : String(error));
    throw new Error("Invalid configuration: " + (error instanceof Error ? error.message : String(error)));
  }
}

// Export the validated configuration
export const config = initializeConfig(); 