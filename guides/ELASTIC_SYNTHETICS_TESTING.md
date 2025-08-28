# Elastic Synthetics Testing Guide

## Overview
This project automatically generates Elastic Synthetics journey tests based on the navigation paths discovered during the Playwright test execution.

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
- **Navigation validation** - Tests all discovered navigation paths
- **Page load verification** - Ensures pages load completely with images
- **Performance metrics** - Captures Core Web Vitals (LCP, CLS, etc.)
- **Multiple click strategies** - Fallback mechanisms for reliable navigation
- **Error handling** - Graceful handling of navigation failures

## Test Output

The synthetics test provides detailed output including:
- Step-by-step execution progress
- Page load timings
- Image loading status
- Performance metrics
- Navigation success/failure

Example output:
```
Journey: MT - PressKit Journey | TommyHilfigerFA25Campaign (core) - prd
🚀 Starting: Go to homepage
✅ DOM ready: 1ms
📸 Found 34 images
✅ Performance metrics validated successfully
🎉 Total load time: 9120ms
✓  Step: 'Go to homepage' succeeded (9470 ms)
```

## Configuration

The journey uses configuration from:
- `config.ts` - Base URL, environment, and browser settings
- `synthetics/synthetics-data.json` - Navigation paths and page data

## Monitoring Setup

To push the journey to Elastic for monitoring:

1. Configure your Elastic credentials:
```bash
export SYNTHETICS_API_KEY="your-api-key"
export SYNTHETICS_PROJECT_ID="your-project-id"
```

2. Push the journey (when ready):
```bash
bun run synthetics:push
```

## Troubleshooting

### Journey test times out
- Increase timeout in the journey file
- Check network connectivity
- Verify the base URL is accessible

### Navigation fails
- The journey includes multiple fallback strategies
- Check if page structure has changed
- Review the synthetics-data.json for outdated selectors

### Images not loading
- The journey waits up to 10 seconds for images
- Check if images are lazy-loaded
- Verify image URLs are valid

## Best Practices

1. **Run regularly** - Test the journey after any navigation changes
2. **Update data** - Regenerate journey after site structure changes
3. **Monitor metrics** - Track performance degradation over time
4. **Custom journeys** - Create specific journeys for critical paths

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
```

## Integration with CI/CD

Add to your CI pipeline:
```yaml
# Example GitHub Actions
- name: Generate Journey
  run: bun run test
  
- name: Test Synthetics
  run: bun run synthetics
  
- name: Push to Elastic (if tests pass)
  if: success()
  run: bun run synthetics:push
```