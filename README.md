# Automate Playwright Elastic

[![Powered by Bun](https://img.shields.io/badge/Powered%20by-Bun-000000?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev)
[![Elastic](https://img.shields.io/badge/Elastic-005571?style=for-the-badge&logo=elastic&logoColor=white)](https://www.elastic.co)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/zx8086/automate-playwright-elastic-)

A comprehensive Playwright-based automation tool for website navigation analysis, asset discovery, and Elastic Synthetics test generation. This project automatically explores websites, downloads assets, takes screenshots, and generates monitoring tests for continuous website health checks.

## Features

- **Automated Website Navigation**: Intelligently discovers and navigates through all website links
- **Asset Discovery & Download**: Identifies and downloads various file types (PDFs, images, documents, etc.)
- **Screenshot Capture**: Takes screenshots of each page for visual documentation
- **Elastic Synthetics Integration**: Automatically generates monitoring tests for Elastic Observability
- **Configurable & Environment-aware**: Supports multiple environments with flexible configuration
- **Visual Sitemap Generation**: Creates HTML sitemaps showing website structure
- **Comprehensive Reporting**: Detailed navigation summaries and element analysis

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Output Files](#output-files)
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
- Viewport dimensions
- SSL certificate handling
- Recording options (screenshots, video, traces)

#### Download Configuration
- Allowed file extensions
- Maximum file size limits
- MIME type restrictions

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
bun run test --timeout=60000

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
│   └── playwright.spec.ts          # Main test suite
├── config.ts                       # Configuration management
├── global-setup.ts                 # Global test setup
├── playwright.config.ts            # Playwright configuration
├── .env.example                    # Environment template
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
├── navigation-screenshots/         # Generated screenshots
├── downloads/                      # Downloaded assets
└── synthetics/                     # Elastic Synthetics outputs
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
| `VIEWPORT_WIDTH` | Browser viewport width | `1280` |
| `VIEWPORT_HEIGHT` | Browser viewport height | `720` |
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
- **Types**: PDFs, images, documents, archives
- **Validation**: File type and size validation before download
- **Logging**: Download success/failure with file sizes

### Elastic Synthetics
- **Data File**: `synthetics/synthetics-data.json` - Structured navigation data
- **Test File**: `synthetics/core.journey.ts` - Ready-to-use Synthetics test
- **Format**: TypeScript test using Elastic Synthetics API

### Visual Sitemap
- **File**: `navigation-screenshots/sitemap.html`
- **Content**: Interactive HTML page showing site structure
- **Features**: Screenshots, element counts, download links

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
        id: 'JourneyType_site',
        schedule: 30,
        screenshot: 'on',
        throttling: false,
        tags: ['environment', 'department', 'domain', 'service', 'site'],
    });

    // Navigation steps...
});
```

### Deployment

The generated `core.journey.ts` file can be directly deployed to Elastic Synthetics:

```bash
# Using Elastic Synthetics CLI
elastic-synthetics push --url <kibana-url> --id <project-id> synthetics/
```

## Supported File Types

### Downloadable Extensions
- **Documents**: `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.csv`
- **Images**: `.jpg`, `.jpeg`, `.png`
- **Media**: `.mp4`, `.mp3`
- **Archives**: `.zip`

### MIME Types
- `application/pdf`
- `application/zip`
- `application/msword`
- `application/vnd.openxmlformats-officedocument.*`
- `text/csv`
- `image/jpeg`, `image/png`
- `video/mp4`, `audio/mpeg`

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
    'nav a',                    // Add new selectors here
    '.custom-menu a',           // Custom navigation patterns
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

#### Navigation Not Found
**Problem**: "No navigation items found"
**Solution**:
- Check if the website uses custom navigation selectors
- Add site-specific selectors to `identifyNavigation` function
- Verify the website loads correctly

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
