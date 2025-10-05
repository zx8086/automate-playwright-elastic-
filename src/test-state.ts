/* src/test-state.ts */

import type { BrokenLink } from "../config";

export class TestState {
  private brokenLinks: Map<string, BrokenLink[]> = new Map();
  private validatedLinksCount: number = 0;
  private totalLinksFound: number = 0;
  private videosFound: number = 0;
  private videosValidated: number = 0;
  private brokenVideos: number = 0;

  // Broken links management
  addBrokenLink(pageUrl: string, brokenLink: BrokenLink): void {
    const existingLinks = this.brokenLinks.get(pageUrl) || [];
    existingLinks.push(brokenLink);
    this.brokenLinks.set(pageUrl, existingLinks);
  }

  getBrokenLinks(): Map<string, BrokenLink[]> {
    return this.brokenLinks;
  }

  clearBrokenLinks(): void {
    this.brokenLinks.clear();
  }

  hasBrokenLinks(): boolean {
    return this.brokenLinks.size > 0;
  }

  getTotalBrokenLinksCount(): number {
    let total = 0;
    for (const links of this.brokenLinks.values()) {
      total += links.length;
    }
    return total;
  }

  // Link validation tracking
  getValidatedLinksCount(): number {
    return this.validatedLinksCount;
  }

  incrementValidatedLinksCount(count: number = 1): void {
    this.validatedLinksCount += count;
  }

  getTotalLinksFound(): number {
    return this.totalLinksFound;
  }

  incrementTotalLinksFound(count: number = 1): void {
    this.totalLinksFound += count;
  }

  // Video tracking
  getVideosFound(): number {
    return this.videosFound;
  }

  incrementVideosFound(count: number = 1): void {
    this.videosFound += count;
  }

  getVideosValidated(): number {
    return this.videosValidated;
  }

  incrementVideosValidated(count: number = 1): void {
    this.videosValidated += count;
  }

  getBrokenVideos(): number {
    return this.brokenVideos;
  }

  incrementBrokenVideos(count: number = 1): void {
    this.brokenVideos += count;
  }

  // Reset state
  reset(): void {
    this.brokenLinks.clear();
    this.validatedLinksCount = 0;
    this.totalLinksFound = 0;
    this.videosFound = 0;
    this.videosValidated = 0;
    this.brokenVideos = 0;
  }

  // Summary statistics
  getSummary() {
    return {
      brokenLinksCount: this.getTotalBrokenLinksCount(),
      validatedLinksCount: this.validatedLinksCount,
      totalLinksFound: this.totalLinksFound,
      videosFound: this.videosFound,
      videosValidated: this.videosValidated,
      brokenVideos: this.brokenVideos,
      pagesWithBrokenLinks: this.brokenLinks.size,
    };
  }
}
