# Automate Playwright Elastic

[![Powered by Bun](https://img.shields.io/badge/Powered%20by-Bun-000000?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev)
[![Elastic](https://img.shields.io/badge/Elastic-005571?style=for-the-badge&logo=elastic&logoColor=white)](https://www.elastic.co)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/zx8086/automate-playwright-elastic-)

A comprehensive Playwright-based automation tool for press kit navigation analysis, asset discovery, and Elastic Synthetics test generation. This project automatically explores press kit websites, downloads assets, takes screenshots, and generates monitoring tests for continuous website health checks.

## Features

- **Broken Image Detection**: Advanced browser-based validation that detects failed image loads on any website
- **Intelligent Press Kit Navigation**: Discovers and navigates through all press kit links with enhanced detection
- **Smart Asset Discovery & Download**: Identifies and downloads press kit assets (PDFs, images, videos, etc.)
- **Duplicate Prevention**: Prevents processing the same URLs and downloads multiple times
- **Screenshot Capture**: Takes screenshots of each page for visual documentation
- **Elastic Synthetics Integration**: Automatically generates monitoring tests with image validation
- **Configurable & Environment-aware**: Supports multiple environments with flexible configuration
- **Visual Sitemap Generation**: Creates HTML sitemaps showing press kit structure
- **Comprehensive Reporting**: Detailed navigation summaries with broken image reports
- **Lazy Loading Support**: Handles modern websites with lazy-loaded and dynamically loaded content

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Output Files](#output-files)
- [Broken Image Detection](#broken-image-detection)
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
ENVIRONMENT=production BASE_URL=https://prod.example.com bun run test

# Development environment
ENVIRONMENT=development BASE_URL=https://dev.example.com bun run  test
```

## Project Structure

```
automate-playwright-elastic/
├── src/
│   └── playwright.spec.ts          # Main test suite with image validation
├── config.ts                       # Configuration management with Zod v4
├── global-setup.ts                 # Global test setup
├── playwright.config.ts            # Playwright configuration
├── .env.example                    # Environment template
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
├── navigation-screenshots/         # Generated screenshots
├── downloads/                      # Downloaded assets
├── synthetics/                     # Elastic Synthetics outputs
└── broken-links-reports/           # Broken image and asset reports
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
- **Content**: Detailed information about broken images and assets
- **Details**: URL, alt text, error messages, HTTP status codes

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

4. **Comprehensive Reporting**
   - Alt text for context
   - Parent element information
   - Detailed error messages
   - HTTP status codes when available

### Example Output

```
🔍 Validating images on "Model Page"...
   Found 14 images on page
   ❌ Browser detected 1 broken images
   ❌ [1] https://example.com/models/image.gif
      Alt: "Model Name"
      Error: Failed to load in browser (naturalWidth=0, complete=true)
```

## Elastic Synthetics Integration

The project automatically generates monitoring tests compatible with Elastic Synthetics:

### Generated Test Features

- **Multiple Navigation Strategies**: Role-based, href-based, and text-based selectors
- **Fallback Mechanisms**: Direct navigation when clicking fails
- **Environment Tagging**: Automatic tagging based on configuration
- **Monitoring Configuration**: Schedule, screenshots, and throttling settings

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

### Configuration Validation

The project uses Zod for configuration validation:

```typescript
// Configuration is automatically validated on startup
// Invalid configurations will throw descriptive errors
```

### Adding New Navigation Selectors

Modify the `identifyNavigation` function in `src/playwright.spec.ts`:

```typescript
const navSelectors = [
    // Press kit specific selectors
    ".press-kit-nav a", ".presskit-nav a", ".pk-nav a",
    
    // Tommy Hilfiger specific patterns
    'a[href*=".html"]',  // Page links
    'a[href*=".pdf"]',   // PDF downloads
    'a[href*=".zip"]',   // ZIP downloads
    'a[href*="/assets/"]', // Asset downloads
    // ...existing selectors
];
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
- Add site-specific selectors to `identifyNavigation` function
- Verify the press kit loads correctly

#### Download Failures
**Problem**: Downloads fail or are skipped
**Solution**:
- Check file size limits (`MAX_DOWNLOAD_SIZE`)
- Verify MIME types are in allowed list
- Ensure sufficient disk space
- Check network connectivity

#### Configuration Errors
**Problem**: "Configuration validation failed"
**Solution**:
- Verify all required environment variables are set
- Check data types (numbers vs strings)
- Validate URL formats
- Review `.env` file syntax

#### Playwright Browser Issues
**Problem**: Browser launch failures
**Solution**:
```bash
# Reinstall browsers
bunx playwright install

# Install system dependencies (Linux)
bunx playwright install-deps

# Check browser status
bunx playwright doctor
```

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
4. Commit changes: `git commit -am 'Add new feature'`
5. Push to branch: `git push origin feature/new-feature`
6. Submit a pull request

## License

This project is private and proprietary. Please ensure compliance with your organization's policies regarding code usage and distribution.

---

For additional support or questions, please refer to your organization's internal documentation or contact the development team.
