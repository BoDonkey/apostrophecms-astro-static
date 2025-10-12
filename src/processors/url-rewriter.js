/**
 * URL Rewriter Processor
 *
 * Rewrites URLs in HTML to be static-friendly:
 * - Converts preview server URLs to relative URLs
 * - Converts query parameters to path segments
 * - Extracts internal links for crawling
 */

import { JSDOM } from 'jsdom';
import { queryParamsToPath } from '../utils.js';

export function extractInternalLinks(html, baseUrl) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const links = new Set();

  const anchors = document.querySelectorAll('a[href]');
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href');
    if (!href) continue;

    try {
      const url = new URL(href, baseUrl);

      if (url.origin === new URL(baseUrl).origin) {
        const pathWithoutHash = url.pathname + url.search;
        if (pathWithoutHash) {
          links.add(pathWithoutHash);
        }
      }
    } catch (error) {
      // Invalid URL, skip
    }
  }

  return Array.from(links);
}

export function makeUrlsRelative(html, previewUrl) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const elements = document.querySelectorAll('a[href], form[action]');

  for (const element of elements) {
    const attr = element.tagName.toLowerCase() === 'a' ? 'href' : 'action';
    const url = element.getAttribute(attr);

    if (!url) continue;

    try {
      let finalUrl = url;

      if (url.startsWith(previewUrl)) {
        const urlObj = new URL(url);
        finalUrl = urlObj.pathname + urlObj.search + urlObj.hash;
      }

      if (finalUrl.includes('?')) {
        const [pathname, search] = finalUrl.split('?');
        const hashIndex = search.indexOf('#');
        const searchWithoutHash = hashIndex >= 0 ? search.substring(0, hashIndex) : search;
        const hash = hashIndex >= 0 ? search.substring(hashIndex) : '';

        const staticPath = queryParamsToPath(pathname + '?' + searchWithoutHash);
        finalUrl = staticPath + hash;
      }

      if (finalUrl !== url) {
        element.setAttribute(attr, finalUrl);
      }
    } catch (error) {
      // Not a valid URL, skip
    }
  }

  return dom.serialize();
}