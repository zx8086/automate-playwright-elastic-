# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a Playwright-based automation tool for press kit navigation analysis, asset discovery, and Elastic Synthetics test generation. It explores press kit websites, downloads assets, takes screenshots, and generates monitoring tests for continuous website health checks.

## Development Commands

### Core Commands
```bash
# Run the main test suite
bun run test

# Run with specific timeout (default: 30s per test, 180s total)
bun run test --timeout=180000

# Run in headed mode (see browser)
bun run test --headed

# Run with HTML reporter
bun run test --reporter=html

# Debug mode with API logs
DEBUG=pw:api bun run test
```

### Package Management
```bash
# Install dependencies
bun install

# Install Playwright browsers
bunx playwright install

# Check outdated packages
bun outdated

# Update dependencies
bun update
```

## Architecture

### Configuration System
- **config.ts**: Centralized configuration using Zod for type-safe validation
- Environment variables override defaults via `.env` file
- Three main config sections: server, browser, and download settings
- Configuration validation happens at startup with descriptive error messages

### Test Structure
- **src/playwright.spec.ts**: Main test file containing navigation logic
  - `identifyNavigation()`: Discovers navigation links using multiple selector strategies
  - `waitForPageLoad()`: Ensures pages are fully loaded before interaction
  - `validateAssetImages()`: Detects broken images using browser-based and HTTP validation
  - `downloadFile()`: Handles asset downloads with validation
  - `navigateToLinkPages()`: Main navigation orchestrator
  - `generateElasticSyntheticsTest()`: Creates monitoring tests with image validation
  - `generateBrokenLinksReport()`: Creates detailed reports of broken images and assets

### Navigation Flow
1. Identifies navigation elements using press-kit specific selectors
2. Processes each link with duplicate prevention
3. Downloads valid assets (checks file size, MIME type, extension)
4. Takes screenshots of each unique page
5. Generates Elastic Synthetics tests from navigation data

### Key Features
- **Broken Image Detection**: Browser-based validation using naturalWidth/Height and complete properties
- **Duplicate Prevention**: Tracks visited URLs and downloaded files to avoid redundancy
- **Smart Asset Detection**: Identifies downloadable links by extension, MIME type, and URL patterns
- **Error Recovery**: Implements retry logic for downloads and navigation
- **Performance Monitoring**: Tracks memory usage and page load metrics
- **Comprehensive Validation**: Dual-layer image validation (browser + HTTP)
- **Lazy Loading Support**: Detects and validates lazy-loaded images

## Directory Structure
```
navigation-screenshots/  # Page screenshots and sitemap.html
downloads/              # Downloaded press kit assets
synthetics/            # Generated Elastic Synthetics tests
  ├── synthetics-data.json
  └── core.journey.ts
broken-links-reports/   # Broken image and asset reports
  ├── broken-links-<timestamp>.json
  └── broken-links-<timestamp>.md
```

## Environment Configuration

Key environment variables (set in `.env`):
- `BASE_URL`: Target website URL
- `ENVIRONMENT`: Environment identifier (development/staging/production)
- `BROWSER_HEADLESS`: Run browser in headless mode (true/false)
- `MAX_DOWNLOAD_SIZE`: Maximum file size in bytes (default: 100MB)
- `PAUSE_BETWEEN_CLICKS`: Delay between actions in ms (default: 1000)

## Testing Approach

### Navigation Selectors
The tool uses multiple selector strategies in `identifyNavigation()`:
- Press kit specific: `.press-kit-nav a`, `.presskit-nav a`, `.pk-nav a`
- Tommy Hilfiger patterns: `a[href*=".html"]`, `a[href*="/assets/"]`
- Generic navigation: `nav a`, `[role="navigation"] a`
- Download links: `a[href$=".pdf"]`, `a[href$=".zip"]`

### Download Validation
Files must pass multiple checks:
1. Extension validation (PDF, images, videos, archives, etc.)
2. MIME type verification
3. File size limits (configurable, default 100MB)
4. Duplicate prevention

### Elastic Synthetics Generation
Generates TypeScript tests with:
- Multiple navigation strategies (role, href, text selectors)
- Fallback mechanisms for failed clicks
- Environment-based tagging
- Monitoring configuration (schedule, screenshots, throttling)
- Comprehensive image validation steps
- Broken image detection and reporting

## Common Development Tasks

### Adding New Navigation Selectors
Edit `identifyNavigation()` in src/playwright.spec.ts:
```typescript
const navSelectors = [
  // Add new selectors here
  ".your-new-selector a",
  // ...existing selectors
];
```

### Customizing Download Types
Update `allowedDownloads` in config.ts:
```typescript
extensions: [".pdf", ".new-type"],
maxFileSize: 200 * 1024 * 1024,
allowedMimeTypes: ["application/custom"]
```

### Debugging Navigation Issues
1. Check console logs for "No navigation items found"
2. Review navigation selectors in `identifyNavigation()`
3. Verify page load with `DEBUG=pw:api bun run test`
4. Check screenshots in `navigation-screenshots/` directory

### Debugging Broken Images
1. Check console output for "❌ Browser detected X broken images"
2. Review broken-links-reports/ for detailed analysis
3. Verify image loading with naturalWidth/Height properties
4. Check for lazy-loaded images that may need additional wait time

## Performance Considerations
- Memory usage is tracked throughout execution
- Page load waits for images and network idle state
- Downloads use streaming to handle large files
- Duplicate prevention reduces unnecessary operations
- Browser context is reused to minimize resource usage
- Image validation uses configurable limits (default: 200 images per page)
- Dual validation approach balances accuracy with performance

## Recent Enhancements

### Broken Image Detection (v2.0)
- **Browser-based validation**: Uses naturalWidth, naturalHeight, and complete properties
- **Picture element support**: Detects images in `<picture>` elements
- **Lazy loading support**: Waits for lazy-loaded images to initialize
- **Detailed reporting**: Provides alt text, parent context, and error details
- **Site-agnostic**: Works on any website, not limited to press kits
- **HTTP fallback**: Optional HTTP validation for cached images

### Zod v4 Integration
- Type-safe configuration validation
- Improved error messages
- Better performance with optimized parsing