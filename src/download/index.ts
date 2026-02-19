/* src/download/index.ts */

/**
 * Download module exports.
 * Provides download management functionality.
 */

// Download Manager
export {
  DownloadManager,
  getDownloadManager,
} from "./download-manager";

// Transfer Page Handler (for external transfer URLs like Bynder, WeTransfer, etc.)
export {
  analyzeTransferPage,
  downloadFromTransferPage,
  isTransferUrl,
  type TransferDownloadResult,
  type TransferPageInfo,
} from "./transfer-handler";
