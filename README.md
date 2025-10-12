# Apostrophe Astro Static

Static site generator for ApostropheCMS + Astro projects. Crawls your Astro preview server, processes dynamic content (video widgets, pagination, filters), and generates a fully static site ready for deployment.

## Features

- 🚀 **Automatic page discovery** - Discovers all pages and pieces from ApostropheCMS
- 🔗 **Smart crawling** - Follows internal links to find pagination and filter pages
- 🎬 **Video widget processing** - Converts video widgets to static HTML using oEmbed at build time
- 📄 **Clean URLs** - Converts query parameters to path segments (`?page=2` → `/page-2/`)
- 🖼️ **Smart asset handling** - Uses existing CDN/S3 by default (configurable to copy/download)
- 🌍 **Multi-locale support** - Generate static sites for multiple locales
- ⚡ **Concurrent rendering** - Fast parallel page generation
- 🔄 **Automatic retries** - Handles transient network errors

## Installation

**Install in your Astro frontend directory:**

```bash
# Navigate to your Astro project folder
cd my-astro-frontend/

# Install the package
npm install apostrophe-astro-static --save-dev
```

### Project Structure

**Monorepo:**
```
my-project/
├── frontend/           ← Install here
│   ├── package.json
│   ├── astro.config.mjs
│   └── src/
└── backend/            ← ApostropheCMS
    ├── package.json
    └── app.js
```

**Separate Repos:**
```
my-astro-site/          ← Install here
├── package.json
├── astro.config.mjs
└── src/
```

## Prerequisites

Before generating your static site:

1. **ApostropheCMS backend must be running** - The static generator queries the CMS API
2. **API access configured** - Set `APOS_EXTERNAL_FRONT_KEY` environment variable
3. **Astro project built** - The package runs `npm run build` automatically

## Quick Start

### Step 1: Start Your ApostropheCMS Backend

```bash
# In your backend directory
cd backend/
npm start
# Backend runs at http://localhost:3000
```

### Step 2: Generate Static Site

```bash
# In your Astro frontend directory
cd frontend/

# Set environment variables
export APOS_HOST=http://localhost:3000
export APOS_EXTERNAL_FRONT_KEY=your-api-key

# Generate static site
npx apos-astro-static --out=dist-static
```

### Command Line

```bash
# Set environment variables
export APOS_HOST=http://localhost:3000
export APOS_EXTERNAL_FRONT_KEY=your-api-key

# Generate static site
npx apos-astro-static --out=dist-static
```

### Programmatic Usage

```javascript
import { exportStatic } from 'apostrophe-astro-static';

const results = await exportStatic({
  aposHost: 'http://localhost:3000',
  aposKey: process.env.APOS_EXTERNAL_FRONT_KEY,
  outputDir: 'dist-static',
  onProgress: (current, total, message) => {
    console.log(`[${current}/${total}] ${message}`);
  }
});

console.log(`✅ Rendered ${results.pagesRendered} pages`);
```

## CLI Options

```
--config=<path>          Path to config file (apos-static.config.js)
--apos-host=<url>        ApostropheCMS backend URL
--apos-key=<key>         API key for ApostropheCMS
--out=<dir>              Output directory (default: static-dist)
--port=<number>          Preview server port (default: 4321)
--host=<ip>              Preview server host (default: 127.0.0.1)
--concurrency=<number>   Max concurrent fetches
--retries=<number>       Number of retries (default: 3)
--piece-types=<a,b,c>    Comma-separated piece types
--locale-config=<path>   Path to locale configuration
--help                   Show help
```

## Configuration File

Create `apos-static.config.js` in your project root:

```javascript
export default {
  aposHost: 'http://localhost:3000',
  aposKey: process.env.APOS_EXTERNAL_FRONT_KEY,
  outputDir: 'dist-static',
  port: 4321,
  host: '127.0.0.1',
  concurrency: 8,
  retries: 3,
  pieceTypes: ['article', 'event', 'product']
};
```

Then run:

```bash
npx apos-astro-static --config=apos-static.config.js
```

## Multi-Locale Support

Create a locale configuration file (e.g., `locales.config.js`):

```javascript
export default {
  en: {
    baseUrl: 'https://example.com',
    prefix: '' // No prefix for default locale
  },
  es: {
    baseUrl: 'https://example.com/es',
    prefix: '/es'
  },
  fr: {
    baseUrl: 'https://example.com/fr',
    prefix: '/fr'
  }
};
```

Then use it:

```bash
npx apos-astro-static --locale-config=locales.config.js
```

Or in your config file:

```javascript
import localeConfig from './locales.config.js';

export default {
  aposHost: 'http://localhost:3000',
  aposKey: process.env.APOS_EXTERNAL_FRONT_KEY,
  localeConfig
};
```

## API Reference

### `exportStatic(options)`

Main function to export a static site.

**Options:**

- `aposHost` (string, required) - ApostropheCMS backend URL
- `aposKey` (string, required) - API key for authentication
- `outputDir` (string) - Output directory (default: 'static-dist')
- `port` (number) - Preview server port (default: 4321)
- `host` (string) - Preview server host (default: '127.0.0.1')
- `concurrency` (number) - Max concurrent requests
- `retries` (number) - Retry attempts (default: 3)
- `pieceTypes` (string[]) - Specific piece types to include
- `localeConfig` (object) - Multi-locale configuration
- `downloadUploads` (boolean|string) - Upload handling:
  - `false` (default): Use CDN/S3 URLs (recommended)
  - `'copy-only'`: Copy local filesystem only
  - `true`: Download all uploads
- `onProgress` (function) - Progress callback `(current, total, message) => {}`

**Returns:** Promise resolving to:

```javascript
{
  success: boolean,
  pagesRendered: number,
  videoWidgetsProcessed: number,
  errors: Array<{url: string, error: string}>,
  outputDir: string
}
```

### `generateSitemap(options)`

Generate a sitemap of URLs from ApostropheCMS.

```javascript
import { generateSitemap } from 'apostrophe-astro-static';

const urls = await generateSitemap({
  aposHost: 'http://localhost:3000',
  aposKey: 'your-api-key',
  locale: 'en',
  pieceTypes: ['article', 'event']
});

console.log(urls); // ['/about/', '/articles/', '/articles/first-post/', ...]
```

## How It Works

**Important:** This tool generates a static site FROM a running ApostropheCMS instance. The CMS must be accessible during the build.

1. **Build Astro** - Runs `npm run build` to build your Astro project
2. **Start Preview** - Spawns Astro preview server (which connects to ApostropheCMS)
3. **Generate Sitemap** - Queries ApostropheCMS API for all pages and pieces
4. **Crawl Pages** - Fetches each page from preview server (Astro gets data from CMS)
5. **Discover Links** - Extracts internal links (finds pagination/filters automatically)
6. **Process Content** - Transforms video widgets (fetches oEmbed from CMS) and other dynamic elements
7. **Rewrite URLs** - Converts query params to static paths
8. **Handle Assets** - By default, leaves CDN/S3 URLs intact (optional: copy/download)
9. **Write Files** - Saves transformed HTML to output directory

### Build vs Runtime

- **Build time** (this tool): Queries CMS, generates static HTML with all data baked in
- **Runtime** (deployed site): Pure static HTML, no CMS connection needed
- **Images**: Stay at CDN URLs by default (no CMS connection needed at runtime)

## Video Widget Processing

Video widgets (`<video-widget url="...">`) are automatically converted to static HTML at build time:

**Before (dynamic):**
```html
<video-widget url="https://youtube.com/watch?v=..."></video-widget>
```

**After (static):**
```html
<div class="video-wrapper">
  <div class="video-container">
    <iframe src="..." title="Video content"></iframe>
  </div>
</div>
```

The oEmbed data is fetched from ApostropheCMS during the build, so no client-side requests are needed.

## Pagination & Filtering

Pages with query parameters are automatically discovered and converted to clean URLs:

- `/articles/?page=2` → `/articles/page-2/index.html`
- `/articles/?category=news` → `/articles/category-news/index.html`
- `/articles/?category=news&page=2` → `/articles/category-news-page-2/index.html`

All links in the HTML are rewritten to point to these new paths.

## Upload Assets

**Important:** By default, the tool **does NOT download** uploads. It leaves image URLs pointing to your existing CDN/S3 storage.

### Why This is the Default

In production ApostropheCMS setups:
- ✅ Images are already on a CDN (S3 + CloudFront, etc.)
- ✅ They're already publicly accessible and optimized
- ✅ Your HTML already has the correct URLs
- ✅ This results in faster builds and smaller deployments
- ✅ No bandwidth costs for your static host

### Upload Handling Options

You can configure upload handling with the `downloadUploads` option:

**`false` (default) - Use CDN URLs**
```javascript
exportStatic({
  aposHost: 'http://localhost:3000',
  aposKey: process.env.APOS_EXTERNAL_FRONT_KEY,
  downloadUploads: false  // or omit entirely
});
```
Images remain at their original URLs (e.g., `https://cdn.example.com/uploads/...`)

**`'copy-only'` - Copy Local Uploads Only**
```javascript
exportStatic({
  aposHost: 'http://localhost:3000',
  aposKey: process.env.APOS_EXTERNAL_FRONT_KEY,
  downloadUploads: 'copy-only'  // For monorepo setups
});
```
Best for development/monorepo: copies from `backend/public/uploads` if available, but doesn't download remote images.

**`true` - Download Everything**
```javascript
exportStatic({
  aposHost: 'http://localhost:3000',
  aposKey: process.env.APOS_EXTERNAL_FRONT_KEY,
  downloadUploads: true  // Fully self-contained
});
```
Creates a fully self-contained site by downloading all referenced uploads. Useful for:
- Complete archives/backups
- Air-gapped deployments
- Sites that need to work without external dependencies

### CLI Usage

```bash
# Default: Use CDN URLs (recommended)
npx apos-astro-static --out=dist-static

# Copy local uploads only (monorepo)
npx apos-astro-static --download-uploads=copy

# Download everything (self-contained)
npx apos-astro-static --download-uploads
```

## Deployment

After generation, deploy the output directory to any static hosting. **The deployed site does not need access to ApostropheCMS** - all content is baked into the HTML at build time.

```bash
# Netlify
netlify deploy --prod --dir=dist-static

# Vercel
vercel --prod dist-static

# AWS S3
aws s3 sync dist-static/ s3://your-bucket/ --delete

# GitHub Pages
# Push dist-static contents to gh-pages branch
```

### Automated Deployment

For continuous deployment, set up a webhook or scheduled build that:

1. Triggers when content changes in ApostropheCMS
2. Runs the static generation (with CMS running)
3. Deploys the output to your static host

See `examples/.github/workflows/deploy-static.yml` for a complete CI/CD example.

## Troubleshooting

### "No URLs found to render"

- **Ensure ApostropheCMS is running** and accessible at the configured `aposHost`
- Check `APOS_EXTERNAL_FRONT_KEY` is valid and has read permissions
- Verify pages are published in ApostropheCMS
- Test the API manually: `curl http://localhost:3000/api/v1/@apostrophecms/page?all=1`

### "Connection refused" or timeout errors

- **ApostropheCMS must be running** during the build
- Check the `aposHost` URL is correct
- Verify no firewall blocking the connection
- For production builds, ensure the CMS is accessible from your build server

### "Preview server did not respond"

- Check Astro build succeeded
- Ensure port is not in use
- Try increasing timeout with custom config
- Check that Astro can connect to ApostropheCMS (preview needs CMS data)

### Video widgets not processing

- **Ensure ApostropheCMS is running** (oEmbed endpoint needed)
- Verify video URLs are valid
- Check `APOS_EXTERNAL_FRONT_KEY` has proper permissions
- Test oEmbed manually: `curl http://localhost:3000/api/v1/@apostrophecms/oembed/query?url=VIDEO_URL`

### Missing uploads

- **By default, uploads stay at their original URLs** - This is intentional! Your images remain on S3/CDN
- For monorepo: Use `downloadUploads: 'copy-only'` to copy local files
- For self-contained site: Use `downloadUploads: true` to download everything
- Check that upload URLs in your ApostropheCMS are publicly accessible

### Package installed in wrong location

- **Must be installed in Astro frontend directory**, not backend
- The package runs `npm run build` and `npm run preview` (Astro commands)
- If you're in a monorepo, make sure you're in the `frontend/` directory

## License

MIT

## Contributing

Issues and pull requests welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.