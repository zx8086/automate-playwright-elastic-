/* src/constants.ts */

/**
 * Centralized constants for the press kit automation tool.
 * All constants are site-agnostic and designed to work with any website.
 */

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

  // Press kit specific selectors (generic patterns)
  ".press-kit-nav a",
  ".presskit-nav a",
  ".pk-nav a",
  ".press-nav a",

  // Common page link patterns (site-agnostic)
  'a[href*=".html"]', // Page links
  'a[href*=".htm"]', // Older page links
  'a[href*=".php"]', // PHP pages

  // Download link patterns (site-agnostic)
  'a[href*=".pdf"]', // PDF downloads
  'a[href*=".zip"]', // ZIP downloads
  'a[href*="/assets/"]', // Asset paths
  'a[href*="/files/"]', // File paths
  'a[href*="/media/"]', // Media paths
  'a[href*="/downloads/"]', // Download paths
  'a[href*="download"]', // Download keyword

  // External transfer patterns (site-agnostic)
  'a[href*="/transfer/"]', // Transfer service URLs
  'a[href*="/share/"]', // Share service URLs
  'a[href*="/dl/"]', // Download service URLs

  // Generic content links
  "main a",
  ".content a",
  ".container a",
  "article a",

  // Footer links (often contain downloads)
  "footer a",
] as const;

export const DOWNLOAD_KEYWORDS = [
  // Generic download path patterns (site-agnostic)
  "/download",
  "/downloads/",
  "/files/",
  "/media/",
  "/press/",
  "/assets/",
  "/resources/",
  "/attachments/",

  // Common archive filename patterns (generic)
  "product.zip",
  "stills.zip",
  "images.zip",
  "media.zip",
  "gallery.zip",
  "press.zip",
  "campaign.zip",
  "assets.zip",
  "photos.zip",
  "documents.zip",

  // Press kit related patterns (generic)
  "press_release",
  "press-release",
  "presskit",
  "press_kit",
  "press-kit",
  "media_kit",
  "media-kit",

  // High-resolution asset patterns (generic)
  "high-res",
  "highres",
  "high_res",
  "hi-res",
  "hires",
  "full-res",
  "fullres",

  // External transfer URL patterns (site-agnostic)
  "/transfer/",
  "/share/",
  "/dl/",
  "/d/",
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
  // Direct download links by file extension (site-agnostic)
  'a[href*=".zip"]',
  'a[href*=".pdf"]',
  'a[href*=".rar"]',
  'a[href*=".7z"]',
  'a[href*=".doc"]',
  'a[href*=".docx"]',
  'a[href*=".xls"]',
  'a[href*=".xlsx"]',

  // Links with generic download path patterns (site-agnostic)
  'a[href*="download"]',
  'a[href*="assets/"]',
  'a[href*="media/"]',
  'a[href*="files/"]',
  'a[href*="resources/"]',
  'a[href*="attachments/"]',

  // Common archive filename patterns (generic)
  'a[href*="product.zip"]',
  'a[href*="stills.zip"]',
  'a[href*="images.zip"]',
  'a[href*="campaign.zip"]',
  'a[href*="press.zip"]',
  'a[href*="gallery.zip"]',
  'a[href*="assets.zip"]',
  'a[href*="photos.zip"]',

  // External transfer URL patterns (site-agnostic)
  'a[href*="/transfer/"]',
  'a[href*="/share/"]',
  'a[href*="/dl/"]',

  // Text-based detection (case variations)
  'a:has-text("download")',
  'a:has-text("Download")',
  'a:has-text("DOWNLOAD")',
  "a[download]",

  // Class-based detection (generic patterns)
  ".download",
  ".download-link",
  ".download-btn",
  ".btn-download",
  ".asset-download",
  ".file-download",

  // Content text patterns (generic)
  'a:has-text("stills")',
  'a:has-text("Stills")',
  'a:has-text("STILLS")',
  'a:has-text("high-res")',
  'a:has-text("High-Res")',
  'a:has-text("hi-res")',
  'a:has-text("assets")',
  'a:has-text("Assets")',
  'a:has-text("ASSETS")',
  'a:has-text("get file")',
  'a:has-text("Get File")',
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
