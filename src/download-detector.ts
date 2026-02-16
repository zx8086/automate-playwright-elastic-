/* src/download-detector.ts */

import * as path from "node:path";
import { DOWNLOAD_KEYWORDS, DOWNLOADABLE_EXTENSIONS } from "./constants";

export class DownloadDetector {
  static isDownloadableResource(url: string): boolean {
    const extension = path.extname(url).toLowerCase();

    // Smart assets page detection that preserves actual downloads
    const isAssetsDirectory =
      ((url.endsWith("/assets/") || url.endsWith("/assets")) && !extension) ||
      (url.includes("/assets/") &&
        (url.endsWith("/assets/") || url.endsWith("/assets")) &&
        !extension);

    if (isAssetsDirectory) {
      console.log(`Checking URL: ${url}`);
      console.log(`   Extension: ${extension}`);
      console.log(`   Assets page detected - treating as regular page, not download`);
      console.log(`   Final result: NOT DOWNLOADABLE`);
      return false;
    }

    const hasDownloadExtension = DOWNLOADABLE_EXTENSIONS.includes(extension as any);
    const hasDownloadKeyword = DOWNLOAD_KEYWORDS.some((keyword) =>
      url.toLowerCase().includes(keyword.toLowerCase())
    );

    const isDownloadLink =
      url.toLowerCase().includes("download") ||
      url.toLowerCase().includes("files/") ||
      url.toLowerCase().includes("media/") ||
      url.toLowerCase().includes("press/") ||
      url.toLowerCase().includes("product.zip") ||
      url.toLowerCase().includes("stills.zip") ||
      url.toLowerCase().includes("images.zip") ||
      url.toLowerCase().includes("campaign.zip") ||
      url.toLowerCase().includes("press_release") ||
      url.toLowerCase().includes("press-release") ||
      url.toLowerCase().includes("high-res") ||
      url.toLowerCase().includes("highres") ||
      (url.toLowerCase().includes("assets") && extension.length > 0) ||
      // Bynder Brand Portal transfer URLs (external download service)
      url.toLowerCase().includes("brandportal.tommy.com/transfer") ||
      url.toLowerCase().includes("/transfer/");

    console.log(`Checking URL: ${url}`);
    console.log(`   Extension: ${extension}`);
    console.log(`   Has download extension: ${hasDownloadExtension}`);
    console.log(`   Has download keyword: ${hasDownloadKeyword}`);
    console.log(`   Is download link: ${isDownloadLink}`);

    const isDownloadable = hasDownloadExtension || hasDownloadKeyword || isDownloadLink;
    console.log(`   Final result: ${isDownloadable ? "DOWNLOADABLE" : "NOT DOWNLOADABLE"}`);

    return isDownloadable;
  }

  static getFileExtension(url: string): string {
    return path.extname(url).toLowerCase();
  }

  static isValidDownloadUrl(url: string): boolean {
    if (
      !url ||
      url === "#" ||
      url.startsWith("javascript:") ||
      url.startsWith("mailto:") ||
      url.startsWith("tel:")
    ) {
      return false;
    }
    return true;
  }
}
