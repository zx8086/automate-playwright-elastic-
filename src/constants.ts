/* src/constants.ts */

export const DOWNLOADABLE_EXTENSIONS = [
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
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".mp4",
  ".mov",
  ".avi",
  ".wmv",
  ".mp3",
  ".wav",
  ".psd",
  ".ai",
  ".eps",
  ".indd",
] as const;

export const NAVIGATION_SELECTORS = [
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
] as const;

export const DOWNLOAD_KEYWORDS = [
  // Generic download path patterns
  "/download",
  "/files/",
  "/media/",
  "/press/",

  // Common archive filenames
  "product.zip",
  "stills.zip",
  "images.zip",
  "media.zip",
  "gallery.zip",
  "press.zip",
  "campaign.zip",

  // Press kit related patterns
  "press_release",
  "press-release",
  "presskit",
  "press_kit",
  "press-kit",

  // High-resolution asset patterns
  "high-res",
  "highres",
  "high_res",

  // External transfer URL pattern (generic)
  "/transfer/",
] as const;

export const VIDEO_SELECTORS =
  'video source, iframe[src*="youtube"], iframe[src*="vimeo"], a[href*=".mp4"], a[href*=".mov"], a[href*=".webm"]';

export const CRITICAL_SELECTORS = ["h1", "main", ".content", ".container"] as const;

export const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
} as const;

export const DOWNLOAD_SELECTORS = [
  // Direct download links by file extension
  'a[href*=".zip"]',
  'a[href*=".pdf"]',
  'a[href*=".rar"]',
  'a[href*=".7z"]',

  // Links with generic download path patterns
  'a[href*="download"]',
  'a[href*="assets/"]',
  'a[href*="media/"]',
  'a[href*="files/"]',

  // Common archive filename patterns
  'a[href*="product.zip"]',
  'a[href*="stills.zip"]',
  'a[href*="images.zip"]',
  'a[href*="campaign.zip"]',
  'a[href*="press.zip"]',
  'a[href*="gallery.zip"]',

  // External transfer URL pattern (generic)
  'a[href*="/transfer/"]',

  // Text-based detection (case variations)
  'a:has-text("download")',
  'a:has-text("Download")',
  'a:has-text("DOWNLOAD")',
  "a[download]",

  // Class-based detection
  ".download",
  ".download-link",
  ".download-btn",
  ".asset-download",

  // Content text patterns
  'a:has-text("stills")',
  'a:has-text("Stills")',
  'a:has-text("STILLS")',
  'a:has-text("high-res")',
  'a:has-text("High-Res")',
  'a:has-text("assets")',
  'a:has-text("Assets")',
  'a:has-text("ASSETS")',
] as const;

export const TIMEOUTS = {
  PAGE_LOAD: 60000, // 60 seconds
  NAVIGATION: 30000, // 30 seconds
  RESOURCE_CHECK: 30000, // 30 seconds
  DOWNLOAD: 60000, // 60 seconds
  RESOURCE_CHECK_SILENT: 5000, // 5 seconds
} as const;

export const RETRY_CONFIG = {
  RESOURCE_VERIFICATION: 3,
  RESOURCE_VERIFICATION_SILENT: 1,
  DOWNLOAD_ATTEMPTS: 3,
} as const;

export const VALIDATION_LIMITS = {
  MAX_IMAGES_TO_VALIDATE: 200,
  MAX_VIDEOS_TO_VALIDATE: 50,
} as const;

export const DEFAULT_TEXT = {
  DOWNLOAD_FALLBACK: "Download",
  NO_CONTEXT: "No context",
} as const;
