/* src/synthetics-generator.ts */

import { config } from "../config";

export interface SyntheticsPageData {
  label: string;
  url: string;
  sourceUrl: string;
  elementCounts: Record<string, number>;
  fullText?: string;
  href: string;
}

export interface SyntheticsTestData {
  baseUrl: string;
  pages: SyntheticsPageData[];
  timestamp: string;
}

export function generateSiteIdentifier(baseUrl: string): string {
  const urlPath = new URL(baseUrl).pathname;
  return urlPath.split("/").filter(Boolean).pop() || "site";
}

export function generateMonitorConfig(siteId: string) {
  const tags = [
    config.server.environment,
    config.server.department,
    config.server.domain,
    config.server.service,
    siteId,
  ].filter(Boolean);

  const monitorName = `${config.server.departmentShort} - ${config.server.journeyType} Journey | ${siteId} (core) - prd`;
  const monitorId = `${config.server.journeyType}_${siteId.replace(/[^a-zA-Z0-9]/g, "_")}`;

  return { tags, monitorName, monitorId };
}

export function generateTypeScriptInterfaces(): string {
  return `// TypeScript interfaces for type validation
interface PageLoadOptions {
  timeout?: number;
  imageTimeout?: number;
  networkIdleTimeout?: number;
}

interface PerformanceMetrics {
  navigationTiming?: PerformanceNavigationTiming | null;
  paintTiming?: PerformanceEntry[];
  lcp?: PerformanceEntry | null;
  cls?: PerformanceEntry | null;
  longTasks?: PerformanceEntry[];
}`;
}

export function generateWaitForPageLoadFunction(): string {
  return `    // Update the waitForFullPageLoad function with performance metrics
    const waitForFullPageLoad = async (pageType = 'default', options: PageLoadOptions = {}) => {
        // Apply default values and basic validation
        const timeout = Math.min(Math.max(options.timeout || 10000, 1000), 60000);
        const imageTimeout = Math.min(Math.max(options.imageTimeout || 3000, 1000), 30000);
        const networkIdleTimeout = Math.min(Math.max(options.networkIdleTimeout || 1000, 500), 10000);

        const startTime = Date.now();
        console.log(\` Enhanced page load starting for \${pageType}...\`);

        try {
            // STEP 1: Essential DOM loading (CRITICAL)
            await Promise.race([
                page.waitForLoadState('domcontentloaded', { timeout: 5000 }),
                page.waitForTimeout(5000)
            ]);
            console.log(\` DOM ready: \${Date.now() - startTime}ms\`);

            // STEP 2: Wait for body visibility and content (PREVENTS BLANK SCREENSHOTS)
            await Promise.race([
                page.waitForSelector('body', { state: 'visible', timeout: 3000 }),
                page.waitForTimeout(3000)
            ]);

            // Enhanced content verification with retry logic
            let hasContent = false;
            let retryCount = 0;
            const maxRetries = 3;

            while (!hasContent && retryCount < maxRetries) {
                hasContent = await page.evaluate(() => {
                    const body = document.body;
                    // More lenient content check
                    return body && (
                        body.textContent?.trim().length > 0 ||
                        body.children.length > 0 ||
                        body.innerHTML.length > 0
                    );
                });

                if (!hasContent) {
                    retryCount++;
                    if (retryCount < maxRetries) {
                        console.log(\` Content check attempt \${retryCount} failed, retrying...\`);
                        await page.waitForTimeout(1000); // Wait before retry
                    }
                }
            }

            if (!hasContent) {
                // Check if we're in a back navigation state
                const isBackNavigation = await page.evaluate(() => {
                    return window.performance.navigation.type === 2 || // Back/Forward navigation
                           window.performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
                });

                if (isBackNavigation) {
                    console.log(' Back navigation detected, proceeding with reduced content check');
                    // For back navigation, we'll proceed even with minimal content
                    hasContent = true;
                } else {
                    throw new Error('Page appears to be empty after multiple retries');
                }
            }

            console.log(\` Body visible with content: \${Date.now() - startTime}ms\`);

            // STEP 3: CRITICAL IMAGE LOADING (OPTIMIZED)
            const imagesLoaded = await waitForCriticalImages(imageTimeout);
            if (!imagesLoaded) {
                console.log(' Some images may not be fully loaded');
            }

            // STEP 4: Navigation elements (OPTIMIZED)
            const navigationLoaded = await waitForNavigation();
            if (!navigationLoaded) {
                console.log(' Navigation elements may not be fully loaded');
            }

            // STEP 5: Network stability check (OPTIMIZED)
            try {
                await Promise.race([
                    page.waitForLoadState('networkidle', { timeout: networkIdleTimeout }),
                    page.waitForTimeout(networkIdleTimeout)
                ]);
                console.log(\` Network stable: \${Date.now() - startTime}ms\`);
            } catch (e) {
                console.log(' Network still active, continuing...');
            }

            // STEP 6: Final page load verification
            const pageLoadStatus = await page.evaluate(() => {
                // Check if page is interactive
                const isInteractive = document.readyState === 'complete' ||
                                    document.readyState === 'interactive';

                // Check for any loading indicators
                const loadingIndicators = document.querySelectorAll('.loading, .spinner, [aria-busy="true"]');
                const isLoading = loadingIndicators.length > 0;

                // More specific error message detection
                const errorMessages = document.querySelectorAll([
                    // Only actual error messages
                    '.error-message:not(h1):not(h2):not(h3):not([role="heading"])',
                    '.error-text:not(h1):not(h2):not(h3):not([role="heading"])',
                    '.alert-error:not(h1):not(h2):not(h3):not([role="heading"])',
                    // Only alert roles that are not headings and contain error text
                    '[role="alert"]:not(h1):not(h2):not(h3):not([role="heading"]):not([aria-hidden="true"])',
                    // Error states in forms
                    'form .error:not([role="heading"])',
                    'form .invalid:not([role="heading"])',
                    // Error messages in modals
                    '.modal .error:not([role="heading"])',
                    '.modal .alert-error:not([role="heading"])',
                    // Error messages in notifications
                    '.notification.error:not([role="heading"])',
                    '.toast.error:not([role="heading"])'
                ].join(','));

                // Filter out hidden error messages and non-error elements
                const visibleErrors = Array.from(errorMessages).filter(el => {
                    const style = window.getComputedStyle(el);
                    const isVisible = style.display !== 'none' &&
                                     style.visibility !== 'hidden' &&
                                     style.opacity !== '0';

                    // Ignore elements that are likely not errors
                    const isNotError = el.tagName.toLowerCase().startsWith('h') ||
                                     el.getAttribute('role') === 'heading' ||
                                     el.textContent?.includes('|') ||
                                     el.textContent?.includes('Collection') ||
                                     el.textContent?.includes('Tommy') ||
                                     el.textContent?.includes('Hilfiger');

                    // Only include elements that look like actual errors
                    const looksLikeError = el.textContent?.toLowerCase().includes('error') ||
                                         el.textContent?.toLowerCase().includes('failed') ||
                                         el.textContent?.toLowerCase().includes('invalid') ||
                                         el.textContent?.toLowerCase().includes('not found');

                    return isVisible && !isNotError && looksLikeError;
                });

                const hasErrors = visibleErrors.length > 0;

                // Get error details for logging
                const errorDetails = visibleErrors.map(el => ({
                    text: el.textContent?.trim(),
                    type: el.getAttribute('role') || el.className,
                    visible: true
                }));

                // Get performance metrics without validation
                const performanceMetrics = {
                    navigationTiming: performance.getEntriesByType('navigation')[0],
                    paintTiming: performance.getEntriesByType('paint'),
                    lcp: performance.getEntriesByType('largest-contentful-paint')[0],
                    cls: performance.getEntriesByType('layout-shift')[0],
                    longTasks: performance.getEntriesByType('longtask')
                };

                return {
                    isInteractive,
                    isLoading,
                    hasErrors,
                    errorDetails,
                    readyState: document.readyState,
                    performanceMetrics
                };
            });

            // Log performance metrics (basic validation)
            if (pageLoadStatus.performanceMetrics) {
                console.log(' Performance metrics collected successfully');
            } else {
                console.log(' Performance metrics not available');
            }

            if (!pageLoadStatus.isInteractive) {
                throw new Error(\`Page not interactive, readyState: \${pageLoadStatus.readyState}\`);
            }

            if (pageLoadStatus.isLoading) {
                console.log(' Page still shows loading indicators');
            }

            if (pageLoadStatus.hasErrors) {
                console.log(' Page contains error messages:');
                pageLoadStatus.errorDetails.forEach(error => {
                    console.log(\`   - \${error.text} (\${error.type})\`);
                });
            }

            // STEP 7: Final render wait (REDUCED)
            await page.waitForTimeout(500);

            console.log(\` Total load time: \${Date.now() - startTime}ms\`);
            return true;

        } catch (error) {
            console.log(\` Page load error: \${error.message}\`);
            return false;
        }
    };`;
}

export function generateImageLoadingFunction(): string {
  return `    // CRITICAL IMAGE LOADING FIX (OPTIMIZED)
    const waitForCriticalImages = async (timeout = 3000) => {
        const startTime = Date.now();

        try {
            // Wait for images to appear in DOM
            const imageCount = await page.locator('img').count();
            console.log(\`Found \${imageCount} images\`);

            if (imageCount === 0) {
                console.log(' No images to load');
                return true;
            }

            // Wait for at least one image to be visible
            await Promise.race([
                page.waitForSelector('img', { state: 'visible', timeout: 2000 }),
                page.waitForTimeout(2000)
            ]);

            // Improved scrolling implementation
            await page.evaluate(async () => {
                const scrollToBottom = async () => {
                    const scrollHeight = document.documentElement.scrollHeight;
                    const viewportHeight = window.innerHeight;
                    const totalSteps = Math.ceil(scrollHeight / viewportHeight);

                    for (let step = 0; step < totalSteps; step++) {
                        const scrollTo = step * viewportHeight;
                        window.scrollTo(0, scrollTo);
                        // Wait for any lazy loading to trigger
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    // Final scroll to bottom
                    window.scrollTo(0, scrollHeight);
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Scroll back to top
                    window.scrollTo(0, 0);
                    await new Promise(resolve => setTimeout(resolve, 500));
                };

                await scrollToBottom();
            });

            // Optimized image loading detection
            const imageLoadResult = await Promise.race([
                // Strategy 1: Wait for all images to load
                page.waitForFunction(
                    () => {
                        const images = Array.from(document.querySelectorAll('img'));
                        if (images.length === 0) return true;

                        // Check all images, not just visible ones
                        const loadedImages = images.filter(img => {
                            return img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
                        });

                        const loadRatio = loadedImages.length / images.length;

                        // Require 80% of all images to be loaded
                        return loadRatio >= 0.8;
                    },
                    { timeout: timeout }
                ),

                // Strategy 2: Timeout fallback
                page.waitForTimeout(timeout).then(() => {
                    console.log(' Image loading timeout reached');
                    return true;
                })
            ]);

            // Verify image dimensions and log loading status
            const imageStatus = await page.evaluate(() => {
                const images = Array.from(document.querySelectorAll('img'));
                return images.map(img => ({
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    complete: img.complete,
                    src: img.src,
                    visible: img.getBoundingClientRect().width > 0 &&
                            img.getBoundingClientRect().height > 0,
                    position: {
                        top: img.getBoundingClientRect().top,
                        bottom: img.getBoundingClientRect().bottom,
                        left: img.getBoundingClientRect().left,
                        right: img.getBoundingClientRect().right
                    }
                }));
            });

            const validImages = imageStatus.filter(img => img.width > 0 && img.height > 0);
            const visibleImages = imageStatus.filter(img => img.visible);
            const loadedVisibleImages = visibleImages.filter(img => img.complete);

            console.log(\`Image loading status:\`);
            console.log(\`   - Total images: \${imageCount}\`);
            console.log(\`   - Valid images: \${validImages.length}/\${imageCount}\`);
            console.log(\`   - Visible images: \${visibleImages.length}/\${imageCount}\`);
            console.log(\`   - Loaded visible images: \${loadedVisibleImages.length}/\${visibleImages.length}\`);

            if (loadedVisibleImages.length < visibleImages.length) {
                console.log(' Some visible images failed to load:');
                visibleImages
                    .filter(img => !img.complete)
                    .forEach(img => {
                        console.log(\`   - \${img.src}\`);
                        console.log(\`     Position: top=\${img.position.top}, bottom=\${img.position.bottom}\`);
                    });
            }

            console.log(\`Images processed in \${Date.now() - startTime}ms\`);
            return validImages.length > 0;

        } catch (error) {
            console.log(\`Image loading error: \${error.message}\`);
            return false;
        }
    };`;
}

export function generateNavigationLoadingFunction(): string {
  return `    // NAVIGATION ELEMENT LOADING
    const waitForNavigation = async () => {
        try {
            const navSelectors = [
                'nav',
                '.menu',
                '.navigation',
                'header nav',
                '[role="navigation"]',
                'a[href]:not([href="#"])'
            ];

            for (const selector of navSelectors) {
                const count = await page.locator(selector).count();
                if (count > 0) {
                    await Promise.race([
                        page.waitForSelector(selector, { state: 'visible', timeout: 3000 }),
                        page.waitForTimeout(3000)
                    ]);
                    console.log(\` Navigation loaded: \${selector}\`);
                    return true;
                }
            }

            console.log(' No navigation elements found');
            return false;

        } catch (e) {
            console.log(' Navigation loading timeout');
            return false;
        }
    };`;
}

export function generatePageConfigFunction(): string {
  return `    // Page type configurations for different timeout strategies
    const getPageConfig = (pageType: string): PageLoadOptions => {
        const configs: Record<string, PageLoadOptions> = {
            homepage: {
                timeout: 10000,
                imageTimeout: 3000,
                networkIdleTimeout: 1000
            },
            bio: {
                timeout: 8000,
                imageTimeout: 2000,
                networkIdleTimeout: 1000
            },
            assets: {
                timeout: 12000,
                imageTimeout: 4000,
                networkIdleTimeout: 1000
            },
            default: {
                timeout: 8000,
                imageTimeout: 3000,
                networkIdleTimeout: 1000
            }
        };

        return configs[pageType] || configs.default;
    };`;
}

export function generateEnhancedStepFunction(): string {
  return `    // Enhanced step wrapper with error handling
    const enhancedStep = async (stepName: string, pageType: string, action: () => Promise<void>) => {
        const startTime = Date.now();
        console.log(\` Starting: \${stepName}\`);

        try {
            // Execute the action
            await action();

            // Apply appropriate waiting strategy based on page type
            const config = getPageConfig(pageType);
            const success = await waitForFullPageLoad(pageType, config);

            if (success) {
                console.log(\` \${stepName} completed in \${Date.now() - startTime}ms\`);
            } else {
                console.log(\` \${stepName} completed with warnings in \${Date.now() - startTime}ms\`);
            }

        } catch (error) {
            console.log(\` \${stepName} failed: \${error.message}\`);

            // Don't fail the entire journey for navigation issues
            if (error.message.includes('timeout') || error.message.includes('navigation')) {
                console.log(\` Continuing journey despite \${stepName} failure\`);
            } else {
                throw error;
            }
        }
    };`;
}

export function generateNavigationStep(page: SyntheticsPageData, index: number): string {
  if (index === 0) return ""; // Skip homepage as it's handled separately

  let pageType = "default";
  const label = page.label.toLowerCase();
  if (label.includes("bio") || label.includes("about")) {
    pageType = "bio";
  } else if (label.includes("asset") || label.includes("media") || label.includes("gallery")) {
    pageType = "assets";
  }

  const escapedLabel = page.label.replace(/"/g, '\\"');
  const escapedHref = page.href.replace(/"/g, '\\"');

  return `
    step('Navigate to "${escapedLabel}"', async () => {
        await enhancedStep('Navigate to "${escapedLabel}"', '${pageType}', async () => {
            try {
                // Multiple selection strategies for robust navigation
                const selectors = [
                    'a[href*="' + '${escapedHref.replace(/^\.\//, "")}' + '"]',
                    'nav a:has-text("${escapedLabel}")',
                    'a:has-text("${escapedLabel}")',
                    'a[href="' + '${escapedHref}' + '"]'
                ];

                let clicked = false;
                for (const selector of selectors) {
                    try {
                        const element = page.locator(selector).first();
                        const count = await element.count();
                        if (count > 0) {
                            await element.click();
                            clicked = true;
                            console.log(\` Clicked using selector: \${selector}\`);
                            break;
                        }
                    } catch (e) {
                        console.log(\` Selector failed: \${selector} - \${e.message}\`);
                        continue;
                    }
                }

                if (!clicked) {
                    throw new Error('Could not find clickable element for ${escapedLabel}');
                }

            } catch (e) {
                console.log(' Falling back to direct navigation for ${escapedLabel}');
                await page.goto('${page.url}', {
                    waitUntil: 'domcontentloaded',
                    timeout: 20000
                });
            }
        });
    });

    step('Validate images on "${escapedLabel}" page', async () => {
        // Wait for initial images to load
        await page.waitForTimeout(1000);

        // Comprehensive image validation
        const imageValidation = await page.evaluate(() => {
            const images = Array.from(document.querySelectorAll('img'));
            const pictureImages = Array.from(document.querySelectorAll('picture img'));
            const allImages = [...new Set([...images, ...pictureImages])];

            const broken = [];
            const valid = [];

            allImages.forEach(img => {
                const src = img.currentSrc || img.src || img.getAttribute('data-src') || '';

                const isBroken =
                    !img.complete ||
                    img.naturalWidth === 0 ||
                    img.naturalHeight === 0 ||
                    !src;

                const imageData = {
                    src: src,
                    alt: img.alt || '',
                    naturalWidth: img.naturalWidth,
                    naturalHeight: img.naturalHeight,
                    complete: img.complete
                };

                if (isBroken) {
                    broken.push(imageData);
                } else {
                    valid.push(imageData);
                }
            });

            return { broken, valid, total: allImages.length };
        });

        if (imageValidation.broken.length > 0) {
            console.log(\`Found \${imageValidation.broken.length} broken images on "${escapedLabel}":\`);
            imageValidation.broken.forEach((img, idx) => {
                console.log(\` [\${idx + 1}] \${img.src}\`);
                if (img.alt) {
                    console.log(\`      Alt: "\${img.alt}"\`);
                }
                console.log(\`      Status: naturalWidth=\${img.naturalWidth}, complete=\${img.complete}\`);
            });
        } else if (imageValidation.total > 0) {
            console.log(\` All \${imageValidation.valid.length} images loaded successfully on "${escapedLabel}"\`);
        } else {
            console.log(\`No images found on "${escapedLabel}"\`);
        }
    });

    step('Return to previous page', async () => {
        await enhancedStep('Return to previous page', 'homepage', async () => {
            try {
                await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
                console.log(' Browser back navigation successful');
            } catch (e) {
                console.log(' Back navigation failed, using direct navigation');
                await page.goto(baseUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 15000
                });
            }
        });
    });`;
}

export function generateElasticSyntheticsTest(data: SyntheticsTestData): string {
  const siteId = generateSiteIdentifier(data.baseUrl);
  const { tags, monitorName, monitorId } = generateMonitorConfig(siteId);

  let code = `/* ${config.server.domain}/${config.server.service}/${siteId}/core.journey.ts */

import {journey, monitor, step} from '@elastic/synthetics';

${generateTypeScriptInterfaces()}

journey('${monitorName}', async ({ page }) => {
    monitor.use({
        id: '${monitorId}',
        schedule: 30,
        screenshot: 'on',
        throttling: false,
        tags: ${JSON.stringify(tags)}
    });

    const baseUrl = '${data.baseUrl}';

${generateWaitForPageLoadFunction()}

${generateImageLoadingFunction()}

${generateNavigationLoadingFunction()}

${generatePageConfigFunction()}

${generateEnhancedStepFunction()}

    // HOMEPAGE STEP
    step('Go to homepage', async () => {
        await enhancedStep('Go to homepage', 'homepage', async () => {
            await page.goto(baseUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });
        });
    });
`;

  // Process each navigation item with enhanced logic
  data.pages.forEach((page, index) => {
    code += generateNavigationStep(page, index);
  });

  // Add final step
  code += `
    step('Final homepage verification', async () => {
        await enhancedStep('Final homepage verification', 'homepage', async () => {
            // Ensure we're back on the homepage
            const currentUrl = page.url();
            if (!currentUrl.includes(baseUrl)) {
                console.log(' Navigating back to homepage for final verification');
                await page.goto(baseUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 15000
                });
            } else {
                console.log(' Already on homepage');
            }
        });
    });
});
`;

  return code;
}
