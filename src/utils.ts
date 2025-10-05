/* src/utils.ts */

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

export function cleanText(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createRequestOptions(
  url: string,
  method: "GET" | "HEAD" = "HEAD",
  timeout: number = 30000
) {
  return {
    method,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      Referer: new URL(url).origin,
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    timeout,
  };
}
