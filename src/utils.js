/**
 * Utility functions for static site generation
 */

import fs from 'fs';
import path from 'path';

export function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  return fetch(url, { ...options, signal: abortController.signal })
    .finally(() => clearTimeout(timeoutId));
}

export async function fetchWithRetry(url, options = {}, timeoutMs = 30000, retries = 3) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      if (response.ok) return response;

      // Don't retry 4xx errors (except 429 rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < retries) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export async function waitForServer(url, { timeoutMs = 60000, intervalMs = 500 } = {}) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetchWithTimeout(url, {}, intervalMs);
      if (response.ok) return true;
    } catch (error) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Preview server did not respond at ${url} within ${timeoutMs}ms`);
}

export function cleanDir(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
}

export function copyDir(sourceDir, destDir) {
  if (!fs.existsSync(sourceDir)) return;

  fs.mkdirSync(destDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDir(sourcePath, destPath);
    } else {
      fs.copyFileSync(sourcePath, destPath);
    }
  }
}

export function queryParamsToPath(urlPath) {
  const [pathname, search] = urlPath.split('?');

  if (!search) {
    return pathname;
  }

  const params = new URLSearchParams(search);
  const parts = [];

  const sortedParams = Array.from(params.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  for (const [key, value] of sortedParams) {
    if (value) {
      parts.push(`${key}-${value}`);
    }
  }

  if (parts.length === 0) {
    return pathname;
  }

  const cleanPath = pathname.replace(/\/$/, '');
  return `${cleanPath}/${parts.join('-')}/`;
}

export function writeHtmlForPath(rootDir, urlPath, html) {
  const staticPath = queryParamsToPath(urlPath);

  const isFile = /\.[a-z0-9]+$/i.test(staticPath);
  let outputPath;

  if (isFile) {
    outputPath = path.join(rootDir, staticPath.replace(/^\//, ""));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  } else if (staticPath === "/") {
    outputPath = path.join(rootDir, "index.html");
  } else {
    outputPath = path.join(rootDir, staticPath.replace(/^\//, ""), "index.html");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  }

  fs.writeFileSync(outputPath, html);
}

export async function mapLimit(items, limit, worker) {
  const queue = [...items];
  const results = { success: 0, failed: 0, errors: [] };

  const runners = Array.from({ length: limit }, async function processQueue() {
    while (queue.length) {
      const item = queue.shift();
      try {
        await worker(item);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({ item, error: error.message });
      }
    }
  });

  await Promise.all(runners);
  return results;
}