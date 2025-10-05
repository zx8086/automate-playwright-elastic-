# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL RULES - NEVER VIOLATE

### NO EMOJIS POLICY
**ABSOLUTELY NO EMOJIS ARE ALLOWED IN THIS CODEBASE. EVER.**
- NEVER use emojis in code files
- NEVER use emojis in comments
- NEVER use emojis in console output
- NEVER use emojis in error messages
- NEVER use emojis in documentation
- NEVER use emojis in commit messages
- NEVER use emojis in any file for any reason whatsoever
- This includes but is not limited to: ✅, ❌, 🚀, 🎯, 🔧, ⚡, or ANY other emoji character
- Use plain text only (e.g., "Success" instead of "✅ Success")
- This rule has NO exceptions and overrides all other instructions

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
- **src/constants.ts**: All constants centralized for maintainability and consistency
- Environment variables override defaults via `.env` file
- Three main config sections: server, browser, and download settings
- Configuration validation happens at startup with descriptive error messages

### Modular Structure
- **src/playwright.spec.ts**: Main test orchestration and navigation flow
- **src/constants.ts**: Centralized constants (selectors, timeouts, limits, defaults)
- **src/download-detector.ts**: Download detection and validation logic
- **src/test-state.ts**: Global state management for cross-page tracking
- **src/utils.ts**: Utility functions and helpers
- **src/synthetics-generator.ts**: Elastic Synthetics test generation

### Key Functions
- `identifyNavigation()`: Discovers navigation links using multiple selector strategies
- `validateAssetImages()`: Detects broken images using browser-based and HTTP validation
- `downloadFile()`: Handles asset downloads with validation and retry logic
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
src/                    # Source code modules
  ├── playwright.spec.ts          # Main test orchestration
  ├── constants.ts                # Centralized constants
  ├── download-detector.ts        # Download detection logic
  ├── test-state.ts               # Global state management
  ├── utils.ts                    # Utility functions
  └── synthetics-generator.ts     # Test generation
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
Add selectors to `NAVIGATION_SELECTORS` in src/constants.ts:
```typescript
export const NAVIGATION_SELECTORS = [
  // Add new selectors here
  ".your-new-selector a",
  // ...existing selectors
] as const;
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
2. Review navigation selectors in `NAVIGATION_SELECTORS` constant
3. Verify page load with `DEBUG=pw:api bun run test`
4. Check screenshots in `navigation-screenshots/` directory

### Debugging Broken Images
1. Check console output for "Browser detected X broken images"
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

### Modular Architecture & Constants Centralization (v2.1)
- **Complete refactoring**: Modular architecture with 31% reduction in main file size
- **Centralized constants**: All constants moved to `src/constants.ts` for maintainability
- **New modules**: `download-detector.ts`, `test-state.ts`, `utils.ts`, `synthetics-generator.ts`
- **Eliminated duplication**: Consistent constant usage across all modules
- **Type safety**: Centralized timeout, retry, and validation configurations
- **Browser context fixes**: Proper parameter passing for constants in page.evaluate()

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