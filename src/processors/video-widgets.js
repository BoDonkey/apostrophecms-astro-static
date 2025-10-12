/**
 * Video Widget Processor
 *
 * Converts <video-widget> custom elements to static HTML by fetching
 * oEmbed data from ApostropheCMS at build time
 */

import { JSDOM } from 'jsdom';
import { fetchWithRetry } from '../utils.js';

export async function processVideoWidgets(html, aposHost, aposKey, retries = 3) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const videoWidgets = document.querySelectorAll('video-widget');

  if (videoWidgets.length === 0) {
    return html;
  }

  for (const widget of videoWidgets) {
    const videoUrl = widget.getAttribute('url');
    const videoTitle = widget.getAttribute('title') || 'Video content';

    if (!videoUrl) {
      widget.outerHTML = '<div class="video-error">No video URL provided</div>';
      continue;
    }

    const oembedData = await fetchOembedData(aposHost, videoUrl, aposKey, retries);
    const staticVideoHtml = createResponsiveVideoHtml(oembedData, videoTitle);
    widget.outerHTML = staticVideoHtml;
  }

  return dom.serialize();
}

async function fetchOembedData(aposHost, videoUrl, aposKey, retries = 3) {
  try {
    const oembedUrl = `${aposHost}/api/v1/@apostrophecms/oembed/query?` + 
      new URLSearchParams({ url: videoUrl });

    const response = await fetchWithRetry(
      oembedUrl,
      {
        headers: {
          'APOS-EXTERNAL-FRONT-KEY': aposKey
        }
      },
      15000,
      retries
    );

    return await response.json();
  } catch (error) {
    console.warn(`   ⚠️  Failed to fetch oEmbed for ${videoUrl}: ${error.message}`);
    return null;
  }
}

function createResponsiveVideoHtml(oembedData, title = 'Video content') {
  if (!oembedData || !oembedData.html) {
    return '<div class="video-error" style="padding: 2rem; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; text-align: center; color: #666;"><p>Video unavailable</p></div>';
  }

  const aspectRatio = oembedData.width && oembedData.height
    ? (oembedData.height / oembedData.width) * 100
    : 56.25;

  const tempDoc = new JSDOM(oembedData.html).window.document;
  const iframe = tempDoc.querySelector('iframe');

  if (iframe) {
    iframe.setAttribute('title', title);
    iframe.removeAttribute('width');
    iframe.removeAttribute('height');
  }

  const embedHtml = tempDoc.body.innerHTML;

  return `
<div class="video-wrapper" style="position: relative; width: 100%; margin-bottom: 1.5rem;">
  <div class="video-container" style="position: relative; width: 100%; height: 0; padding-bottom: ${aspectRatio}%; overflow: hidden;">
    ${embedHtml}
  </div>
</div>
<style>
  .video-container iframe {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    border: 0 !important;
  }
</style>`.trim();
}