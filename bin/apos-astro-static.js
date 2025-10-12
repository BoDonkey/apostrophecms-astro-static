#!/usr/bin/env node

/**
 * CLI for Apostrophe Astro Static Export
 */

import { exportStatic } from '../src/index.js';
import fs from 'fs';
import path from 'path';

function parseCliArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      const camelKey = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

      if (value === undefined) {
        // Handle flags
        if (key === 'download-uploads') {
          options.downloadUploads = true;
        } else {
          options[camelKey] = true;
        }
      } else if (key === 'piece-types') {
        options.pieceTypes = value.split(',').map(t => t.trim()).filter(Boolean);
      } else if (key === 'download-uploads') {
        if (value === 'copy' || value === 'copy-only') {
          options.downloadUploads = 'copy-only';
        } else if (value === 'true') {
          options.downloadUploads = true;
        } else {
          options.downloadUploads = false;
        }
      } else if (!isNaN(value)) {
        options[camelKey] = Number(value);
      } else {
        options[camelKey] = value;
      }
    }
  }

  return options;
}

async function loadConfig(configPath) {
  try {
    const fullPath = path.resolve(configPath);
    const config = (await import(fullPath)).default;
    return config;
  } catch (error) {
    console.error(`Failed to load config from ${configPath}: ${error.message}`);
    process.exit(1);
  }
}

function printUsage() {
  console.log(`
Usage: apos-astro-static [options]

Options:
  --config=<path>          Path to config file (apos-static.config.js)
  --apos-host=<url>        ApostropheCMS backend URL (default: APOS_HOST env var)
  --apos-key=<key>         API key (default: APOS_EXTERNAL_FRONT_KEY env var)
  --out=<dir>              Output directory (default: static-dist)
  --port=<number>          Preview server port (default: 4321)
  --host=<ip>              Preview server host (default: 127.0.0.1)
  --concurrency=<number>   Max concurrent fetches (default: CPU count, max 8)
  --retries=<number>       Number of retries for failed fetches (default: 3)
  --piece-types=<a,b,c>    Comma-separated piece types to include
  --locale-config=<path>   Path to locale configuration file
  --download-uploads       Download all uploads (default: false, uses CDN URLs)
  --download-uploads=copy  Copy local uploads only (monorepo)
  --help                   Show this help message

Environment Variables:
  APOS_HOST                ApostropheCMS backend URL
  APOS_EXTERNAL_FRONT_KEY  API key for accessing ApostropheCMS

Examples:
  # Basic usage
  apos-astro-static --apos-host=http://localhost:3000

  # With config file
  apos-astro-static --config=apos-static.config.js

  # Custom output and concurrency
  apos-astro-static --out=dist-static --concurrency=16

Config File Example (apos-static.config.js):
  export default {
    aposHost: 'http://localhost:3000',
    aposKey: process.env.APOS_EXTERNAL_FRONT_KEY,
    outputDir: 'static-dist',
    port: 4321,
    concurrency: 8,
    pieceTypes: ['article', 'event']
  };
  `);
}

async function main() {
  const cliOptions = parseCliArgs();

  if (cliOptions.help) {
    printUsage();
    process.exit(0);
  }

  let config = {};

  // Load config file if specified
  if (cliOptions.config) {
    config = await loadConfig(cliOptions.config);
  }

  // Merge CLI options over config file
  const options = {
    ...config,
    ...cliOptions,
    aposHost: cliOptions.aposHost || config.aposHost || process.env.APOS_HOST,
    aposKey: cliOptions.aposKey || config.aposKey || process.env.APOS_EXTERNAL_FRONT_KEY
  };

  // Load locale config if specified
  if (options.localeConfig && typeof options.localeConfig === 'string') {
    options.localeConfig = await loadConfig(options.localeConfig);
  }

  if (!options.aposHost) {
    console.error('❌ Error: aposHost is required (use --apos-host or APOS_HOST env var)');
    process.exit(1);
  }

  if (!options.aposKey) {
    console.error('❌ Error: aposKey is required (use --apos-key or APOS_EXTERNAL_FRONT_KEY env var)');
    process.exit(1);
  }

  // Progress reporting
  let lastProgress = 0;
  options.onProgress = (current, total, message) => {
    const percent = Math.round((current / total) * 100);
    if (percent !== lastProgress || message) {
      console.log(`[${percent}%] ${message || ''}`);
      lastProgress = percent;
    }
  };

  console.log('🚀 Starting Apostrophe Astro Static Export...\n');

  try {
    const results = await exportStatic(options);

    console.log('\n✅ Export complete!');
    console.log(`   📄 Pages rendered: ${results.pagesRendered}`);

    if (results.videoWidgetsProcessed > 0) {
      console.log(`   🎬 Video widgets processed: ${results.videoWidgetsProcessed}`);
    }

    console.log(`   📂 Output: ${results.outputDir}`);

    if (results.errors.length > 0) {
      console.warn(`\n⚠️  ${results.errors.length} pages failed:`);
      results.errors.slice(0, 5).forEach(({ url, error }) => {
        console.warn(`   - ${url}: ${error}`);
      });
      if (results.errors.length > 5) {
        console.warn(`   ... and ${results.errors.length - 5} more`);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Export failed:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();