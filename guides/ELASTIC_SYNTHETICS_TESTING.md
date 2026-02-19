# Elastic Synthetics Testing Guide

## Overview

This project automatically generates Elastic Synthetics journey tests based on the navigation paths discovered during the Playwright test execution. The generated tests include comprehensive monitoring capabilities for production websites.

## Available Scripts

### 1. Generate Journey (Prerequisite)

First, run the main test to discover navigation and generate the journey:

```bash
bun run test
```

This creates:
- `synthetics/core.journey.ts` - The Elastic Synthetics journey file
- `synthetics/synthetics-data.json` - Navigation data used by the journey

### 2. Test Synthetics Locally

Run the generated journey test locally:

```bash
bun run synthetics
# or
npm run synthetics
```

### 3. Test All Synthetics Files

If you have multiple journey files:

```bash
bun run synthetics:all
# or
npm run synthetics:all
```

### 4. Generate and Test (Combined)

Generate the journey and immediately test it:

```bash
bun run generate-and-test
# or
npm run generate-and-test
```

## Journey Test Features

The generated journey test includes:

- **Navigation Validation** - Tests all discovered navigation paths
- **Page Load Verification** - Ensures pages load completely with images
- **Broken Image Detection** - Browser-based validation of image loading
- **Performance Metrics** - Captures Core Web Vitals (LCP, CLS, etc.)
- **Multiple Click Strategies** - Fallback mechanisms for reliable navigation
- **Error Handling** - Graceful handling of navigation failures
- **External Transfer Support** - Validates external download links

## Generated Journey Structure

### Journey Configuration

```typescript
journey('Department - Journey Type | SiteName (core) - env', async ({ page }) => {
    monitor.use({
        id: 'PressKit_site',
        schedule: 30,
        screenshot: 'on',
        throttling: false,
        tags: ['environment', 'department', 'domain', 'service', 'site'],
    });

    // Navigation steps with validation
});
```

### Image Validation Step

Each page includes browser-based image validation:

```typescript
step('Validate images on page', async () => {
    const imageValidation = await page.evaluate(() => {
        const images = document.querySelectorAll('img');
        const brokenImages = [];

        images.forEach((img) => {
            // Check naturalWidth/naturalHeight
            if (img.complete && img.naturalWidth === 0) {
                brokenImages.push({
                    src: img.src,
                    alt: img.alt,
                });
            }
        });

        return {
            total: images.length,
            broken: brokenImages,
        };
    });

    if (imageValidation.broken.length > 0) {
        console.log('Broken images found:', imageValidation.broken);
    }
});
```

### Navigation Step with Fallbacks

```typescript
step('Navigate to Page', async () => {
    // Strategy 1: Role-based click
    try {
        await page.getByRole('link', { name: 'Page Name' }).click();
    } catch {
        // Strategy 2: Href-based click
        try {
            await page.locator('a[href*="page-url"]').click();
        } catch {
            // Strategy 3: Direct navigation
            await page.goto('https://example.com/page-url');
        }
    }
});
```

## Test Output

The synthetics test provides detailed output including:

- Step-by-step execution progress
- Page load timings
- Image loading status
- Performance metrics
- Navigation success/failure
- Broken link detection results

Example output:

```
Journey: MT - PressKit Journey | Campaign (core) - prd
Starting: Go to homepage
DOM ready: 1ms
Found 34 images
Performance metrics validated successfully
Total load time: 9120ms
Step: 'Go to homepage' succeeded (9470 ms)
```

## Configuration

The journey uses configuration from:

- `config.ts` - Base URL, environment, and browser settings
- `synthetics/synthetics-data.json` - Navigation paths and page data
- `src/constants.ts` - Timeouts, selectors, and validation limits

### Key Configuration Options

| Setting | Source | Description |
|---------|--------|-------------|
| `baseUrl` | `config.ts` | Target website URL |
| `environment` | `config.ts` | Environment identifier (prd, stg, dev) |
| `department` | `config.ts` | Department name for tagging |
| `journeyType` | `config.ts` | Journey type identifier |
| `TIMEOUTS.PAGE_LOAD` | `constants.ts` | Page load timeout (60s) |
| `VALIDATION_LIMITS.MAX_IMAGES_TO_VALIDATE` | `constants.ts` | Max images per page (200) |

## Monitoring Setup

### Local Testing

Test the journey locally before deploying:

```bash
# Run with verbose output
npx @elastic/synthetics synthetics/core.journey.ts --verbose

# Run in headed mode (see browser)
npx @elastic/synthetics synthetics/core.journey.ts --headed
```

### Configure Elastic Credentials

Set up your Elastic credentials for pushing journeys:

```bash
export SYNTHETICS_API_KEY="your-api-key"
export SYNTHETICS_PROJECT_ID="your-project-id"
```

### Push to Elastic

Deploy the journey for continuous monitoring:

```bash
bun run synthetics:push
```

## Synthetics Data Format

The `synthetics-data.json` file contains structured navigation data:

```json
{
  "navigation": [
    {
      "label": "Page Name",
      "from": "https://example.com/",
      "to": "https://example.com/page",
      "isDownloadable": false,
      "elementCounts": {
        "images": 15,
        "videos": 2,
        "downloads": 3
      }
    }
  ],
  "downloads": [
    {
      "url": "https://example.com/file.pdf",
      "fileName": "document.pdf",
      "fileSize": 1234567
    }
  ],
  "brokenLinks": []
}
```

## Troubleshooting

### Journey test times out

- Increase timeout in the journey file or via CLI: `--timeout 60000`
- Check network connectivity
- Verify the base URL is accessible
- Review `TIMEOUTS.PAGE_LOAD` in `src/constants.ts`

### Navigation fails

- The journey includes multiple fallback strategies
- Check if page structure has changed
- Review the `synthetics-data.json` for outdated selectors
- Regenerate the journey after site changes: `bun run test`

### Images not loading

- The journey waits for images to complete loading
- Check if images are lazy-loaded (may need scroll simulation)
- Verify image URLs are valid and accessible
- Check for CORS restrictions on external images

### External transfer links fail

- Transfer links may expire after a certain time
- Regenerate journey data if transfer links have changed
- Check network access to external transfer services

### Broken images reported

- Browser-based detection uses `naturalWidth/naturalHeight`
- Some images may fail due to CORS restrictions
- CDN or authentication issues can cause false positives
- Review the broken links report for details

## Best Practices

1. **Run regularly** - Test the journey after any navigation changes
2. **Update data** - Regenerate journey after site structure changes
3. **Monitor metrics** - Track performance degradation over time
4. **Custom journeys** - Create specific journeys for critical paths
5. **Environment separation** - Use different monitors for each environment
6. **Tag management** - Use consistent tags for filtering and alerting

## Advanced Usage

### Custom Parameters

Pass custom parameters to the journey:

```bash
npx @elastic/synthetics synthetics/core.journey.ts --params '{"headless": false}'
```

### Filter by Tags

Run specific journeys by tag:

```bash
npx @elastic/synthetics synthetics/ --tags "production"
```

### Different Reporters

Use different output formats:

```bash
npx @elastic/synthetics synthetics/core.journey.ts --reporter json
npx @elastic/synthetics synthetics/core.journey.ts --reporter junit
```

### Screenshot Configuration

Control screenshot behavior:

```bash
# Only on failure
npx @elastic/synthetics synthetics/core.journey.ts --screenshots=only-on-failure

# Disable screenshots
npx @elastic/synthetics synthetics/core.journey.ts --screenshots=off
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Synthetics Testing

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Install Playwright browsers
        run: bunx playwright install --with-deps chromium

      - name: Generate Journey
        run: bun run test

      - name: Test Synthetics
        run: bun run synthetics

      - name: Push to Elastic (on main branch)
        if: github.ref == 'refs/heads/main' && success()
        env:
          SYNTHETICS_API_KEY: ${{ secrets.SYNTHETICS_API_KEY }}
          SYNTHETICS_PROJECT_ID: ${{ secrets.SYNTHETICS_PROJECT_ID }}
        run: bun run synthetics:push

      - name: Upload Reports
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: synthetics-reports
          path: |
            broken-links-reports/
            synthetics/
```

### GitLab CI Example

```yaml
synthetics:
  stage: test
  image: oven/bun:latest

  script:
    - bun install
    - bunx playwright install --with-deps chromium
    - bun run test
    - bun run synthetics

  artifacts:
    paths:
      - broken-links-reports/
      - synthetics/
    when: always

  rules:
    - if: $CI_COMMIT_BRANCH == "main"
```

## Generated Files

| File | Description |
|------|-------------|
| `synthetics/core.journey.ts` | Main Elastic Synthetics journey file |
| `synthetics/synthetics-data.json` | Navigation data and metadata |
| `broken-links-reports/*.json` | JSON format broken links reports |
| `broken-links-reports/*.md` | Markdown format broken links reports |
| `navigation-screenshots/*.png` | Page screenshots |
| `navigation-screenshots/sitemap.html` | Visual sitemap |
