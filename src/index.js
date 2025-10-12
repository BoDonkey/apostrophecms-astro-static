/**
 * Apostrophe Astro Static Export
 *
 * Main API for generating static sites from ApostropheCMS + Astro projects
 */

import os from "os";
import fs from "fs";
import path from "path";
import { spawn, execSync } from "child_process";
import { generateSitemap } from "./sitemap.js";
import { processVideoWidgets } from "./processors/video-widgets.js";
import { makeUrlsRelative, extractInternalLinks } from "./processors/url-rewriter.js";
import {
  copyAposUploadsFromFs,
  extractImagesFromHtml
} from "./processors/uploads.js";
import {
  fetchWithRetry,
  waitForServer,
  cleanDir,
  copyDir,
  writeHtmlForPath,
  mapLimit
} from "./utils.js";

/**
 * Export a static site from ApostropheCMS + Astro
 *
 * @param {Object} options - Configuration options
 * @param {string} options.aposHost - ApostropheCMS backend URL (e.g., 'http://localhost:3000')
 * @param {string} options.aposKey - APOS_EXTERNAL_FRONT_KEY for API access
 * @param {string} [options.outputDir='static-dist'] - Output directory for static files
 * @param {number} [options.port=4321] - Preview server port
 * @param {string} [options.host='127.0.0.1'] - Preview server host
 * @param {number} [options.concurrency] - Max concurrent fetches (default: CPU count, max 8)
 * @param {number} [options.retries=3] - Number of retries for failed fetches
 * @param {string[]} [options.pieceTypes] - Optional: specific piece types to include
 * @param {Object} [options.localeConfig] - Multi-locale configuration
 * @param {boolean|string} [options.downloadUploads=false] - Upload handling:
 *   - false (default): Leave URLs pointing to original S3/CDN (recommended for production)
 *   - 'copy-only': Copy from local filesystem only (monorepo setups)
 *   - true: Download all referenced uploads (fully self-contained site)
 * @param {Function} [options.onProgress] - Progress callback (current, total, message)
 * @returns {Promise<Object>} Export results
 */
export async function exportStatic(options = {}) {
  const {
    aposHost,
    aposKey,
    outputDir = 'static-dist',
    port = 4321,
    host = '127.0.0.1',
    concurrency = Math.min(8, Math.max(2, os.cpus().length)),
    retries = 3,
    pieceTypes,
    localeConfig,
    onProgress = () => {}
  } = options;

  if (!aposHost) {
    throw new Error('aposHost is required');
  }

  if (!aposKey) {
    throw new Error('aposKey is required');
  }

  const previewUrl = `http://${host}:${port}`;
  const resolvedOutputDir = path.resolve(outputDir);

  const results = {
    success: true,
    pagesRendered: 0,
    videoWidgetsProcessed: 0,
    errors: [],
    outputDir: resolvedOutputDir
  };

  onProgress(0, 100, 'Building Astro...');

  try {
    execSync("npm run build", { stdio: "inherit" });
  } catch (error) {
    throw new Error('Astro build failed');
  }

  onProgress(10, 100, 'Starting preview server...');

  const astroProcess = spawn(
    "npm", 
    ["run", "preview", "--", "--host", host, "--port", String(port)], 
    {
      stdio: ["ignore", "inherit", "inherit"],
      detached: process.platform !== "win32"
    }
  );

  function shutdown() {
    if (!astroProcess.killed) {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(astroProcess.pid), "/T", "/F"]);
      } else {
        try {
          process.kill(-astroProcess.pid, "SIGTERM");
        } catch {
          try {
            astroProcess.kill("SIGTERM");
          } catch {}
        }
      }
    }
  }

  try {
    await waitForServer(previewUrl, { timeoutMs: 90000, intervalMs: 800 });
    onProgress(20, 100, 'Preview server ready');

    onProgress(25, 100, 'Generating sitemap...');

    let allUrls = [];

    if (localeConfig) {
      for (const [locale, config] of Object.entries(localeConfig)) {
        const urls = await generateSitemap({ 
          aposHost,
          aposKey,
          locale,
          pieceTypes
        });

        // Apply locale prefix if configured
        const prefixedUrls = applyLocalePrefix(urls, config.prefix);
        allUrls.push(...prefixedUrls);
      }

      allUrls = Array.from(new Set(allUrls)).sort();
    } else {
      allUrls = await generateSitemap({ aposHost, aposKey, pieceTypes });
    }

    if (allUrls.length === 0) {
      throw new Error('No URLs found to render');
    }

    onProgress(35, 100, 'Preparing output directory...');
    cleanDir(resolvedOutputDir);

    // Copy Astro build assets
    const distDir = path.join(process.cwd(), "dist");
    const distClientDir = path.join(distDir, "client");

    if (fs.existsSync(distClientDir)) {
      copyDir(distClientDir, resolvedOutputDir);
    } else if (fs.existsSync(distDir)) {
      copyDir(distDir, resolvedOutputDir);
    }

    onProgress(40, 100, `Rendering ${allUrls.length} pages...`);

    const processedUrls = new Set();
    const urlQueue = [...allUrls];
    let processedVideoWidgets = 0;

    while (urlQueue.length > 0) {
      const batch = urlQueue.splice(0, concurrency * 2);
      const batchUrls = batch.filter(url => !processedUrls.has(url));

      if (batchUrls.length === 0) continue;

      await mapLimit(batchUrls, concurrency, async (urlPath) => {
        if (processedUrls.has(urlPath)) return;

        const pageUrl = new URL(urlPath, previewUrl).toString();

        try {
          const response = await fetchWithRetry(pageUrl, {}, 60000, retries);
          let html = await response.text();

          // Extract internal links
          const foundLinks = extractInternalLinks(html, previewUrl);
          for (const link of foundLinks) {
            if (!processedUrls.has(link) && !urlQueue.includes(link)) {
              urlQueue.push(link);
            }
          }

          // Process video widgets
          const videoWidgetCount = (html.match(/<video-widget/g) || []).length;
          if (videoWidgetCount > 0) {
            html = await processVideoWidgets(html, aposHost, aposKey, retries);
            processedVideoWidgets += videoWidgetCount;
          }

          // Rewrite URLs
          html = makeUrlsRelative(html, previewUrl);

          writeHtmlForPath(resolvedOutputDir, urlPath, html);
          processedUrls.add(urlPath);

          const progress = 40 + Math.round((processedUrls.size / (processedUrls.size + urlQueue.length)) * 50);
          onProgress(progress, 100, `Rendered ${processedUrls.size} pages`);
        } catch (error) {
          results.errors.push({ url: urlPath, error: error.message });
        }
      });
    }

    results.pagesRendered = processedUrls.size;
    results.videoWidgetsProcessed = processedVideoWidgets;

    // Handle uploads based on configuration
    if (options.downloadUploads === true) {
      onProgress(90, 100, 'Processing uploads...');

      const uploadsCopied = await copyAposUploadsFromFs(resolvedOutputDir);
      if (!uploadsCopied) {
        await extractImagesFromHtml(resolvedOutputDir, aposHost, retries);
      }
    } else if (options.downloadUploads === 'copy-only') {
      onProgress(90, 100, 'Copying local uploads...');
      await copyAposUploadsFromFs(resolvedOutputDir);
    }
    // If downloadUploads is false (default), leave URLs pointing to original CDN/S3

    // Create 404 page
    onProgress(95, 100, 'Creating 404 page...');
    try {
      const response = await fetchWithRetry(`${previewUrl}/404`, {}, 30000, retries);
      if (response.ok) {
        const html = await response.text();
        fs.writeFileSync(path.join(resolvedOutputDir, "404.html"), html);
      }
    } catch {
      const notFoundPath = path.join(resolvedOutputDir, "404.html");
      if (!fs.existsSync(notFoundPath)) {
        fs.writeFileSync(
          notFoundPath, 
          "<!doctype html><meta charset='utf-8'><title>Not found</title><h1>404</h1>"
        );
      }
    }

    onProgress(100, 100, 'Export complete!');

    if (results.errors.length > 0) {
      results.success = false;
    }

    return results;
  } finally {
    shutdown();
  }
}

function applyLocalePrefix(urls, localePrefix) {
  if (!localePrefix) return urls;

  return urls.map(url => {
    if (url.startsWith(localePrefix + '/') || url === localePrefix) {
      return url;
    }

    if (url === '/') {
      return localePrefix + '/';
    }

    return localePrefix + url;
  });
}

export { generateSitemap } from "./sitemap.js";
export * from "./processors/index.js";