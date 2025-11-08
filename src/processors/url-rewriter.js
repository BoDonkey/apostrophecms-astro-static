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

export function extractInternalLinks(html, baseUrl, hostAllowlist = new Set()) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const links = new Set();

  const anchors = document.querySelectorAll('a[href]');
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href');
    if (!href) continue;

    try {
      const base = new URL(baseUrl);
      const url = new URL(href, base);
      // Treat as internal if same-origin OR in the allowlist (multi-host locales)
      if (url.origin === base.origin || hostAllowlist.has(url.host)) {
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

export function makeUrlsRelative(html, previewUrl, hostAllowlist = new Set()) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const elements = document.querySelectorAll('a[href], form[action]');

  for (const element of elements) {
    const attr = element.tagName.toLowerCase() === 'a' ? 'href' : 'action';
    const url = element.getAttribute(attr);

    if (!url) continue;

    try {
      let finalUrl = url;
      const base = new URL(previewUrl);
      const u = new URL(url, base);
      if (u.origin === base.origin || hostAllowlist.has(u.host)) {
        finalUrl = u.pathname + u.search + u.hash;
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