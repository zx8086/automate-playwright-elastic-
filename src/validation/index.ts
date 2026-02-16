/* src/validation/index.ts */

/**
 * Validation module exports.
 * Provides URL validation and image validation functionality.
 */

// Image Validator
export {
  createImageValidator,
  getImageValidator,
  ImageValidator,
} from "./image-validator";
// URL Validator
export {
  extractEmbeddedUrl,
  isAssetsDirectory,
  isDownloadableUrl,
  isExternalTransferUrl,
  isMalformedExternalUrl,
  isValidUrl,
  normalizeUrl,
  parseExternalTransferPage,
} from "./url-validator";
