/**
 * Uploads Processor
 *
 * Handles ApostropheCMS uploads:
 * - Copies from local filesystem if available (monorepo)
 * - Downloads referenced images from ApostropheCMS backend
 */

import fs from 'fs';
import path from 'path';
import { fetchWithRetry, copyDir } from '../utils.js';

export async function copyAposUploadsFromFs(staticDir) {
  const candidatePaths = [
    path.join(process.cwd(), "..", "backend", "public", "uploads"),
    path.join(process.cwd(), "backend", "public", "uploads"),
    path.join(process.cwd(), "..", "..", "backend", "public", "uploads"),
    path.join(process.cwd(), "public", "uploads")
  ];

  for (const candidatePath of candidatePaths) {
    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isDirectory()) {
      const files = fs.readdirSync(candidatePath);
      if (files.length > 0) {
        console.log(`   Copying uploads from: ${candidatePath}`);
        copyDir(candidatePath, path.join(staticDir, "uploads"));
        return true;
      }
    }
  }

  return false;
}

export async function extractImagesFromHtml(staticDir, aposHost, retries = 3) {
  const htmlFiles = [];

  (function walkDirectory(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filePath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walkDirectory(filePath);
      } else if (entry.isFile() && entry.name.endsWith(".html")) {
        htmlFiles.push(filePath);
      }
    }
  })(staticDir);

  const uploadUrls = new Set();
  const escapedHost = aposHost.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const urlRegex = new RegExp(
    `(?:src|href)=["'](?:${escapedHost})?/uploads/[^"']+["']`, 
    "gi"
  );

  for (const htmlFile of htmlFiles) {
    const htmlContent = fs.readFileSync(htmlFile, "utf8");
    const matches = htmlContent.matchAll(urlRegex);

    for (const match of matches) {
      const urlMatch = match[0].match(/["']([^"']+)["']/);
      if (urlMatch) {
        uploadUrls.add(urlMatch[1]);
      }
    }
  }

  if (uploadUrls.size === 0) {
    console.log("   No upload URLs found in HTML");
    return;
  }

  console.log(`   Downloading ${uploadUrls.size} upload assets...`);
  let downloaded = 0;
  let failed = 0;

  for (const uploadUrl of uploadUrls) {
    try {
      const fullUrl = uploadUrl.startsWith("http") ? uploadUrl : `${aposHost}${uploadUrl}`;
      const relativePath = fullUrl.replace(/^https?:\/\/[^/]+/, "");
      const destPath = path.join(staticDir, relativePath);

      fs.mkdirSync(path.dirname(destPath), { recursive: true });

      const response = await fetchWithRetry(fullUrl, {}, 60000, retries);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(destPath, buffer);
      downloaded++;
    } catch (error) {
      failed++;
      console.warn(`   ⚠️  Failed to download: ${uploadUrl}`);
    }
  }

  console.log(`   ✓ Downloaded ${downloaded} assets${failed > 0 ? `, ${failed} failed` : ''}`);
}