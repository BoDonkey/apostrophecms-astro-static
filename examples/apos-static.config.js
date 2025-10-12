/**
 * Example configuration for Apostrophe Astro Static Export
 * 
 * Copy this to your project root as apos-static.config.js and customize
 */

export default {
  // ApostropheCMS backend URL
  aposHost: process.env.APOS_HOST || 'http://localhost:3000',

  // API key for accessing ApostropheCMS
  aposKey: process.env.APOS_EXTERNAL_FRONT_KEY,

  // Output directory for static files
  outputDir: 'static-dist',

  // Astro preview server configuration
  port: 4321,
  host: '127.0.0.1',

  // Performance tuning
  concurrency: 8,  // Max concurrent page fetches
  retries: 3,      // Number of retries for failed requests

  // Upload handling (optional)
  // Default (false): Leave URLs pointing to CDN/S3 - recommended for production
  // 'copy-only': Copy from local filesystem only (monorepo development)
  // true: Download all uploads for fully self-contained site
  downloadUploads: false,

  // Optional: Specify which piece types to include
  // If omitted, all piece types will be auto-discovered
  pieceTypes: [
    'article',
    'event',
    'product'
  ],

  // Optional: Multi-locale configuration
  // See examples/locales.config.js
  // localeConfig: await import('./locales.config.js').then(m => m.default),

  // Optional: Progress callback for custom logging
  onProgress: (current, total, message) => {
    const percent = Math.round((current / total) * 100);
    console.log(`[${percent}%] ${message}`);
  }
};