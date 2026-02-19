# Automate Playwright & Elastic Synthetic Generation

[![Powered by Bun](https://img.shields.io/badge/Powered%20by-Bun-000000?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev)
[![Elastic](https://img.shields.io/badge/Elastic-005571?style=for-the-badge&logo=elastic&logoColor=white)](https://www.elastic.co)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/zx8086/automate-playwright-elastic-)

A comprehensive Playwright-based automation tool for press kit navigation analysis, asset discovery, and Elastic Synthetics test generation. This project automatically explores press kit websites, downloads assets, takes screenshots, and generates monitoring tests for continuous website health checks.

## Features

- **Site-Agnostic Design**: Works with any press kit website without brand-specific configuration
- **Broken Image Detection**: Advanced browser-based validation that detects failed image loads on any website
- **Malformed URL Detection**: Identifies incorrectly concatenated URLs (e.g., `/pathhttps://example.com`)
- **External Transfer Support**: Handles browser-based downloads from transfer services (Bynder, WeTransfer, etc.)
- **Intelligent Press Kit Navigation**: Discovers and navigates through all press kit links with enhanced detection
- **Smart Asset Discovery & Download**: Identifies and downloads press kit assets (PDFs, images, videos, etc.)
- **Duplicate Prevention**: Prevents processing the same URLs and downloads multiple times
- **Screenshot Capture**: Takes screenshots of each page for visual documentation
- **Elastic Synthetics Integration**: Automatically generates monitoring tests with image validation
- **Configurable & Environment-aware**: Supports multiple environments with flexible configuration
- **Visual Sitemap Generation**: Creates HTML sitemaps showing press kit structure
- **Comprehensive Reporting**: Detailed navigation summaries with broken image and link reports
- **Lazy Loading Support**: Handles modern websites with lazy-loaded and dynamically loaded content

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Output Files](#output-files)
- [Broken Image Detection](#broken-image-detection)
- [Malformed URL Detection](#malformed-url-detection)
- [External Transfer Downloads](#external-transfer-downloads)
- [Elastic Synthetics Integration](#elastic-synthetics-integration)
- [Supported File Types](#supported-file-types)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## Installation

### Prerequisites

- [Bun](https://bun.sh) v1.2.13 or higher
- Node.js (for Playwright compatibility)

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd automate-playwright-elastic
```

2. Install dependencies:
```bash
bun install
```

3. Install Playwright browsers:
```bash
bunx playwright install
```

4. Copy the environment configuration:
```bash
cp .env.example .env
```

5. Update the `.env` file with your specific configuration (see [Environment Variables](#environment-variables))

## Configuration

The project uses a flexible configuration system that combines default values with environment variables. Configuration is managed through:

- **Default values** in `config.ts`
- **Schema validation** in `schemas.ts` using Zod v4
- **Environment variables** from `.env` file
- **Runtime overrides** via environment variables

### Key Configuration Sections

#### Server Configuration
- Base URL for website exploration
- Directory paths for outputs
- Timing and performance settings
- Environment and service identification

#### Browser Configuration
- Headless mode settings
- Viewport dimensions (default: 1920x1080)
- SSL certificate handling
- Recording options (screenshots, video, traces)

#### Download Configuration
- Allowed file extensions
- Maximum file size limits (default: 100MB)
- MIME type restrictions
- Download timeout and retry settings

## Usage

### Basic Usage

Run the complete website analysis:

```bash
bun run test
```

### Command Line Options

The test can be customized using Playwright's built-in options:

```bash
# Run in headless mode
bun run test --headed=false

# Run with specific timeout
bun run test --timeout=180000

# Generate HTML report
bun run test --reporter=html
```

### Environment-Specific Runs

Set environment variables for different configurations:

```bash
# Production environment
ENVIRONMENT=production BASE_URL=https://presskit.example.com/Campaign/ bun run test

# Development environment
ENVIRONMENT=development BASE_URL=https://dev.presskit.example.com/Campaign/ bun run test

# Test different press kit sites
BASE_URL=https://www.prd.presskits.example.com/campaign-name/ bun run test
BASE_URL=https://www.dev.presskits.example.com/campaign-name/ bun run test
```

## Architecture

The project follows a modular architecture with clear separation of concerns:

### Core Modules

| Module | Purpose |
|--------|---------|
| **core/** | Shared types, HTTP client, and retry logic |
| **validation/** | URL and image validation utilities |
| **navigation/** | Page navigation and element discovery |
| **download/** | Asset download orchestration and transfer handling |
| **reporting/** | Broken link report generation |

### Design Principles

- **Site-Agnostic**: No hardcoded brand or domain patterns
- **Generic URL Detection**: Uses pattern-based detection for external URLs
- **Single Responsibility**: Each module handles one concern
- **Type Safety**: Comprehensive TypeScript types with guards
- **Configurable**: All behavior controlled via environment variables

## Project Structure

```
automate-playwright-elastic/
  src/
    playwright.spec.ts          # Main test suite with navigation logic
    constants.ts                # Centralized constants and selectors
    download-detector.ts        # Download detection and validation
    test-state.ts               # Global test state management
    utils.ts                    # Utility functions and helpers
    synthetics-generator.ts     # Elastic Synthetics test generation

    core/                       # Core shared functionality
      index.ts                  # Module exports
      types.ts                  # Shared TypeScript interfaces
      http-client.ts            # HTTP operations with retry
      retry-handler.ts          # Generic retry logic

    validation/                 # Validation utilities
      index.ts                  # Module exports
      url-validator.ts          # URL validation (malformed, external)
      image-validator.ts        # Image validation (browser + HTTP)

    navigation/                 # Navigation discovery
      index.ts                  # Module exports
      navigation-handler.ts     # Navigation item discovery
      page-scanner.ts           # Page element scanning

    download/                   # Download management
      index.ts                  # Module exports
      download-manager.ts       # Download orchestration
      transfer-handler.ts       # External transfer page downloads

    reporting/                  # Report generation
      index.ts                  # Module exports
      report-generator.ts       # Broken links report generation

  config.ts                     # Configuration management with Zod v4
  schemas.ts                    # Zod validation schemas
  global-setup.ts               # Global test setup
  playwright.config.ts          # Playwright configuration
  biome.json                    # Biome linting configuration
  .env.example                  # Environment template
  package.json                  # Dependencies and scripts
  tsconfig.json                 # TypeScript configuration

  guides/                       # Documentation guides
    CONFIGURATION_ARCHITECTURE.md
    ELASTIC_SYNTHETICS_TESTING.md
    ZOD_V4_MIGRATION.md

  navigation-screenshots/       # Generated screenshots
  downloads/                    # Downloaded assets
  synthetics/                   # Elastic Synthetics outputs
  broken-links-reports/         # Broken image and asset reports
```

## Environment Variables

Configure the application using these environment variables in your `.env` file:

### Server Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `BASE_URL` | Target website URL | `https://example.com/` |
| `SCREENSHOT_DIR` | Screenshot output directory | `./navigation-screenshots` |
| `DOWNLOADS_DIR` | Downloaded files directory | `./downloads` |
| `SYNTHETICS_DIR` | Elastic Synthetics output directory | `./synthetics` |
| `PAUSE_BETWEEN_CLICKS` | Delay between actions (ms) | `1000` |
| `ENVIRONMENT` | Environment identifier | `development` |
| `DEPARTMENT` | Department name | `your_department` |
| `DEPARTMENT_SHORT` | Department abbreviation | `YD` |
| `DOMAIN` | Domain identifier | `your-domain` |
| `SERVICE` | Service name | `your-service` |
| `JOURNEY_TYPE` | Journey type for monitoring | `YourJourney` |

### Browser Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `BROWSER_HEADLESS` | Run browser in headless mode | `false` |
| `VIEWPORT_WIDTH` | Browser viewport width | `1920` |
| `VIEWPORT_HEIGHT` | Browser viewport height | `1080` |
| `IGNORE_HTTPS_ERRORS` | Ignore SSL certificate errors | `true` |
| `SCREENSHOT_MODE` | Screenshot capture mode | `on` |
| `VIDEO_MODE` | Video recording mode | `on` |
| `TRACE_MODE` | Trace recording mode | `on` |

### Download Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `MAX_DOWNLOAD_SIZE` | Maximum file size in bytes | `104857600` (100MB) |

### Validation Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `MAX_IMAGES_TO_VALIDATE` | Max images to validate per page | `200` |
| `MAX_VIDEOS_TO_VALIDATE` | Max videos to validate per page | `50` |
| `VALIDATE_ASSET_IMAGES` | Enable asset image validation | `true` |

## Output Files

The automation generates several types of output files:

### Screenshots
- **Location**: `navigation-screenshots/` directory
- **Format**: PNG files
- **Naming**: Based on navigation item names (e.g., `about-us.png`)
- **Purpose**: Visual documentation of each page

### Downloaded Assets
- **Location**: `downloads/` directory
- **Types**: PDFs, images, videos, archives
- **Validation**: File type and size validation before download
- **Logging**: Download success/failure with file sizes
- **Duplicate Prevention**: Each download is processed only once

### Elastic Synthetics
- **Data File**: `synthetics/synthetics-data.json` - Structured navigation data
- **Test File**: `synthetics/core.journey.ts` - Ready-to-use Synthetics test
- **Format**: TypeScript test using Elastic Synthetics API

### Visual Sitemap
- **File**: `navigation-screenshots/sitemap.html`
- **Content**: Interactive HTML page showing site structure
- **Features**: Screenshots, element counts, download links

### Broken Links Reports
- **Location**: `broken-links-reports/` directory
- **JSON Format**: `broken-links-<timestamp>.json` - Structured data for processing
- **Markdown Format**: `broken-links-<timestamp>.md` - Human-readable report
- **Latest**: `broken-links-latest.json` - Most recent report
- **Content**: Detailed information about broken images and malformed URLs

## Broken Image Detection

The tool includes advanced broken image detection capabilities that work on any website:

### Detection Methods

1. **Browser-based Validation**
   - Checks `naturalWidth` and `naturalHeight` properties (0 = failed load)
   - Verifies the `complete` property status
   - Detects images that fail to render despite successful HTTP responses

2. **Picture Element Support**
   - Handles modern `<picture>` elements with multiple sources
   - Validates responsive images with srcset attributes

3. **Lazy Loading Support**
   - Waits for lazy-loaded images to initialize
   - Detects dynamically loaded images via JavaScript

4. **HTTP Validation**
   - Verifies image URLs return valid responses
   - Reports HTTP status codes for failed images

### Example Output

```
[VALIDATE] Validating images on "Model Page"...
   Found 14 images on page
   Validating 14 of 14 browser-loaded images via HTTP...
Found 1 broken images on "Model Page"
  [1] https://example.com/models/image.gif
      Alt: "Model Name"
      Error: All verification attempts failed
```

## Malformed URL Detection

The tool detects malformed URLs where paths are incorrectly concatenated with external URLs:

### Detection Pattern

```
Malformed: /campaign-pathhttps://external.com/transfer/abc123
Correct:   https://external.com/transfer/abc123
```

### How It Works

1. **Pattern Detection**: Identifies URLs containing `https://` or `http://` that don't start with the protocol
2. **URL Extraction**: Can extract the correct external URL from malformed ones
3. **Reporting**: Reports malformed URLs in broken links reports with detailed context

### Example Output

```
[BROKEN] Malformed URL detected on "Assets" page
   Link text: "Download"
   Broken href: /CampaignNamehttps://external.com/transfer/abc123
   Error: Malformed URL - path incorrectly concatenated with external URL
```

## External Transfer Downloads

The tool supports browser-based downloads from external transfer services:

### Supported Transfer Services

The transfer handler is site-agnostic and works with any service that:
- Uses `/transfer/` URL pattern
- Provides download buttons/links on the page
- May require user interaction to start downloads

Common services include:
- Bynder Brand Portal
- WeTransfer
- Dropbox
- Google Drive
- Custom enterprise transfer services

### How It Works

1. **URL Detection**: Identifies external transfer URLs by pattern (e.g., `/transfer/{id}`)
2. **Page Analysis**: Navigates to the transfer page and analyzes for download configuration
3. **Download Extraction**: Finds download buttons, direct links, or JavaScript-based downloads
4. **Browser Download**: Uses Playwright's download handling to save files

### Example Output

```
[TRANSFER] Starting browser-based download for: https://transfer.example.com/transfer/abc123
[TRANSFER] Page analysis result:
   File: campaign-assets.zip
   Direct URL found: https://cdn.example.com/files/abc123/campaign-assets.zip
[TRANSFER] Successfully downloaded: campaign-assets.zip (156.7 MB)
```

## Elastic Synthetics Integration

The project automatically generates monitoring tests compatible with Elastic Synthetics:

### Generated Test Features

- **Multiple Navigation Strategies**: Role-based, href-based, and text-based selectors
- **Fallback Mechanisms**: Direct navigation when clicking fails
- **Environment Tagging**: Automatic tagging based on configuration
- **Monitoring Configuration**: Schedule, screenshots, and throttling settings
- **Image Validation**: Built-in broken image detection steps

### Test Structure

```typescript
journey('Department - Journey Type | site (core) - env', async ({ page }) => {
    monitor.use({
        id: 'PressKit_site',
        schedule: 30,
        screenshot: 'on',
        throttling: false,
        tags: ['environment', 'department', 'domain', 'service', 'site'],
    });

    // Navigation steps with image validation
    step('Validate images on page', async () => {
        const imageValidation = await page.evaluate(() => {
            // Browser-based image validation
        });
    });
});
```

## Supported File Types

### Downloadable Extensions
- **Documents**: `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.csv`, `.txt`, `.rtf`
- **Images**: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.bmp`, `.tiff`
- **Media**: `.mp4`, `.mov`, `.avi`, `.wmv`, `.mp3`, `.wav`, `.m4v`, `.webm`
- **Archives**: `.zip`, `.rar`, `.7z`
- **Design Files**: `.psd`, `.ai`, `.eps`, `.indd`, `.sketch`

### MIME Types
- **Documents**: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.*`
- **Archives**: `application/zip`, `application/x-zip-compressed`, `application/x-rar-compressed`
- **Images**: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml`
- **Media**: `video/mp4`, `video/quicktime`, `video/x-msvideo`, `audio/mpeg`, `audio/wav`
- **Generic**: `application/octet-stream`

### Size Limits
- **Default Maximum**: 100MB per file
- **Configurable**: Via `MAX_DOWNLOAD_SIZE` environment variable
- **Validation**: Real-time size checking during download

## Development

### Running Tests

```bash
# Run all tests
bun run test

# Run with debugging
DEBUG=pw:api bun run test

# Run specific test file
bun run test src/playwright.spec.ts

# Run with custom configuration
ENVIRONMENT=staging bun run test
```

### Code Quality

```bash
# Type checking
bun run typecheck

# Linting and formatting
bun run biome:check

# Auto-fix linting issues
bun run biome:check:write
```

### Configuration Validation

The project uses Zod v4 for configuration validation:

```typescript
// Configuration is automatically validated on startup
// Invalid configurations will throw descriptive errors
```

### Adding New Navigation Selectors

Add selectors to the `NAVIGATION_SELECTORS` array in `src/constants.ts`:

```typescript
export const NAVIGATION_SELECTORS = [
    // Standard navigation
    "nav a", "header a", ".menu a",

    // Press kit specific selectors
    ".press-kit-nav a", ".presskit-nav a",

    // File type patterns
    'a[href*=".html"]',  // Page links
    'a[href*=".pdf"]',   // PDF downloads
    'a[href*=".zip"]',   // ZIP downloads

    // Add new selectors here
    ".your-new-selector a",
] as const;
```

### Customizing Download Types

Update the `allowedDownloads` configuration in `config.ts`:

```typescript
allowedDownloads: {
    extensions: [".pdf", ".new-type"],  // Add new extensions
    maxFileSize: 200 * 1024 * 1024,    // Increase size limit
    allowedMimeTypes: ["application/custom"] // Add MIME types
}
```

## Troubleshooting

### Common Issues

#### Broken Images Not Detected
**Problem**: Images appear broken but are not detected
**Solution**:
- Check if images are lazy-loaded (may need additional wait time)
- Verify images are in `<img>` or `<picture>` tags
- Check browser console for CORS errors
- Ensure images have finished loading before validation

#### False Positive Broken Images
**Problem**: Valid images reported as broken
**Solution**:
- May be CORS restricted (browser can't validate cross-origin)
- Check if images require authentication
- Verify network connectivity to image servers
- Some CDNs block automated requests

#### Navigation Not Found
**Problem**: "No navigation items found"
**Solution**:
- Check if the press kit uses custom navigation selectors
- Add site-specific selectors to `NAVIGATION_SELECTORS` in constants
- Verify the press kit loads correctly

#### Malformed URLs Detected
**Problem**: URLs reported as malformed
**Solution**:
- This indicates a real issue in the source website
- The URL path is incorrectly concatenated with an external URL
- Report the issue to the website maintainers
- The tool correctly extracts the embedded URL for validation

#### Download Failures
**Problem**: Downloads fail or are skipped
**Solution**:
- Check file size limits (`MAX_DOWNLOAD_SIZE`)
- Verify MIME types are in allowed list
- Ensure sufficient disk space
- Check network connectivity

#### Transfer Page Downloads Fail
**Problem**: External transfer links fail to download
**Solution**:
- Transfer links may have expired
- Check if the transfer service requires authentication
- Verify network access to the transfer service
- Try regenerating the transfer link

#### Configuration Errors
**Problem**: "Configuration validation failed"
**Solution**:
- Verify all required environment variables are set
- Check data types (numbers vs strings)
- Validate URL formats
- Review `.env` file syntax

#### Playwright Browser Issues
**Problem**: Browser launch failures after upgrading Playwright
**Solution**:

When you upgrade `@playwright/test` or `playwright` packages, the browser binaries need to be reinstalled because each Playwright version bundles specific browser versions.

Error message typically looks like:
```
Error: browserType.launch: Executable doesn't exist at .../ms-playwright/chromium-XXXX/...
```

Fix:
```bash
# Reinstall browsers (automatic via postinstall hook)
bun install

# Or manually reinstall browsers
bunx playwright install

# Install system dependencies (Linux)
bunx playwright install-deps

# Check browser status
bunx playwright doctor
```

**Prevention**: The project has a `postinstall` script that automatically runs `bunx playwright install` after any `bun install` or `bun update`.

### Debug Mode

Enable detailed logging:

```bash
# Playwright debug mode
DEBUG=pw:api bun run test

# Configuration debug
NODE_ENV=development bun run test

# With memory usage monitoring
bun run test
```

### Performance Optimization

For large websites:

```bash
# Increase timeout
TIMEOUT=180000 bun run test

# Reduce screenshot quality
SCREENSHOT_MODE=only-on-failure bun run test

# Skip video recording
VIDEO_MODE=off bun run test
```

## Recent Updates

### Version 2.3 - External Transfer Download Support
- **Transfer Handler Module**: New `transfer-handler.ts` for browser-based downloads
- **Site-agnostic Transfer Detection**: Works with any transfer service using `/transfer/` pattern
- **Page Analysis**: Extracts download configuration from transfer pages
- **Multiple Download Strategies**: Direct URL downloads and button click handling
- **Improved Error Handling**: Better detection of expired or invalid transfer links

### Version 2.2 - Site-Agnostic Modular Architecture
- **Site-agnostic design**: Removed all brand-specific patterns and hardcoding
- **Generic URL detection**: Uses pattern-based detection for external transfer URLs
- **Malformed URL detection**: Identifies incorrectly concatenated URLs
- **New modules**: core/, validation/, navigation/, download/, reporting/
- **Type safety**: Comprehensive TypeScript interfaces with type guards
- **Code quality**: Biome linting integration

### Version 2.1 - Modular Architecture & Constants Centralization
- Complete refactoring into modular architecture with 31% reduction in main file size
- Centralized all constants in `src/constants.ts` for better maintainability
- New modular files: `download-detector.ts`, `test-state.ts`, `utils.ts`, `synthetics-generator.ts`
- Eliminated code duplication with consistent constant usage across modules
- Improved type safety with centralized timeout, retry, and validation configurations

### Version 2.0 - Enhanced Broken Image Detection
- Browser-based image validation using naturalWidth/Height properties
- Support for picture elements and lazy-loaded images
- Detailed error reporting with context information
- Site-agnostic implementation works on any website

### Version 1.9 - Zod v4 Integration
- Upgraded to Zod v4 for improved type safety
- Enhanced configuration validation
- Better error messages and performance

### Version 1.8 - Elastic Synthetics Scripts
- Added test generation scripts
- Fixed video detection capabilities
- Enhanced monitoring configuration

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make changes and test: `bun run test`
4. Run linting: `bun run biome:check:write`
5. Commit changes: `git commit -am 'Add new feature'`
6. Push to branch: `git push origin feature/new-feature`
7. Submit a pull request

## License

This project is private and proprietary. Please ensure compliance with your organization's policies regarding code usage and distribution.

---

For additional support or questions, please refer to your organization's internal documentation or contact the development team.
