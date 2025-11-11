/**
 * Sitemap Generator
 *
 * Discovers all pages and pieces from ApostropheCMS to generate
 * a list of URLs that should be statically rendered
 */

import { fetchWithTimeout } from './utils.js';

function normalizeUrl(urlString) {
  try {
    const url = new URL(urlString, "http://dummy");
    let pathname = url.pathname;

    if (!pathname.startsWith("/")) {
      pathname = "/" + pathname;
    }

    if (!pathname.endsWith(".html") && !pathname.endsWith(".htm") && !pathname.includes(".")) {
      if (!pathname.endsWith("/")) {
        pathname = pathname + "/";
      }
    }

    return pathname;
  } catch {
    let pathname = urlString.split("?")[0].split("#")[0];

    if (!pathname.startsWith("/")) {
      pathname = "/" + pathname;
    }

    if (!/\.[a-z0-9]+$/i.test(pathname) && !pathname.endsWith("/")) {
      pathname += "/";
    }

    return pathname;
  }
}

async function fetchAllPages(aposHost, headers, locale = null) {
  let url = `${aposHost}/api/v1/@apostrophecms/page?all=1&flat=1&published=1`;

  if (locale) {
    url += `&aposLocale=${locale}`;
  }

  const response = await fetchWithTimeout(url, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch pages: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  const pages = Array.isArray(json) ? json : (json.results ?? json);
  const urls = [];

  for (const page of pages || []) {
    if (typeof page._url === "string") {
      urls.push(normalizeUrl(page._url));
    }
  }

  if (!locale) {
    if (!urls.includes("/")) {
      urls.push("/");
    }
  }

  return Array.from(new Set(urls)).sort();
}

async function probeCandidates(aposHost, headers) {
  try {
    const response = await fetchWithTimeout(`${aposHost}/api/v1/`, { headers });
    if (!response.ok) return [];

    const data = await response.json();

    if (data && typeof data === "object" && !Array.isArray(data)) {
      return Object.keys(data)
        .filter(key => typeof data[key] !== "function")
        .filter(key => !key.startsWith("@apostrophecms/"))
        .filter(key => !["search", "page"].includes(key));
    }
  } catch (error) {
    // Probing failed
  }

  return [];
}

async function isPieceEndpoint(aposHost, headers, endpointKey, locale = null) {
  try {
    let url = `${aposHost}/api/v1/${endpointKey}?perPage=1`;

    if (locale) {
      url += `&aposLocale=${locale}`;
    }

    const response = await fetchWithTimeout(url, { headers }, 15000);
    if (!response.ok) return false;

    const json = await response.json();
    const results = json?.results;

    if (Array.isArray(results) && results.length) {
      return Boolean(results[0]?._url);
    }

    if (Array.isArray(results) && results.length === 0) {
      return true;
    }
  } catch (error) {
    // Endpoint check failed
  }

  return false;
}

async function discoverPieceTypes(aposHost, headers, locale = null) {
  const candidates = await probeCandidates(aposHost, headers);
  const discoveredTypes = [];

  for (const key of candidates) {
    if (await isPieceEndpoint(aposHost, headers, key, locale)) {
      discoveredTypes.push(key);
    }
  }

  const heuristicTypes = ["article", "news", "product", "blog", "event"];

  for (const heuristicType of heuristicTypes) {
    if (!discoveredTypes.includes(heuristicType) && 
        await isPieceEndpoint(aposHost, headers, heuristicType, locale)) {
      discoveredTypes.push(heuristicType);
    }
  }

  return Array.from(new Set(discoveredTypes));
}

async function fetchAllPieces(aposHost, headers, pieceType, locale = null) {
  const urls = [];
  let currentPage = 1;
  const itemsPerPage = 100;

  for (;;) {
    let url = `${aposHost}/api/v1/${pieceType}?page=${currentPage}&perPage=${itemsPerPage}`;

    if (locale) {
      url += `&aposLocale=${locale}`;
    }

    const response = await fetchWithTimeout(url, { headers }, 30000);
    if (!response.ok) break;

    const json = await response.json();
    const results = json?.results ?? [];

    for (const piece of results) {
      if (piece?._url) {
        urls.push(normalizeUrl(piece._url));
      }
    }

    if (results.length < itemsPerPage) break;
    currentPage += 1;
  }

  return urls;
}

async function discoverIndexPageVariations(aposHost, aposKey, pageUrl, locale = null) {
  const variations = [pageUrl];
  try {
    let fetchUrl = `${aposHost}${pageUrl}`;
    if (locale) fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + `aposLocale=${locale}`;
    const res = await fetchWithTimeout(fetchUrl, { headers: { 'APOS-EXTERNAL-FRONT-KEY': aposKey } });
    if (!res.ok) return variations;
    const html = await res.text();

    const m = html.match(/window\.apos\s*=\s*({[\s\S]*?});/);
    if (!m) return variations;
    let aposData; try { aposData = JSON.parse(m[1]); } catch { return variations; }

    const totalPages = aposData?.page?.totalPages || aposData?.totalPages || 1;
    const filters = aposData?.page?.piecesFilters || aposData?.piecesFilters || [];

    for (let p = 2; p <= totalPages; p++) variations.push(`${pageUrl}?page=${p}`);

    for (const f of filters) {
      if (!f?.value) continue;
      const u = new URL(f.url, 'http://dummy');
      const q = u.searchParams.toString();
      if (q) variations.push(`${pageUrl}?${q}`);
    }
  } catch {}
  return Array.from(new Set(variations));
}

async function discoverAllIndexVariations(aposHost, aposKey, urls, locale = null) {
  const out = [];
  for (const u of urls) {
    const likelyIndex = u.match(/^\/[\w-]+\/$/) || u === '/';
    if (likelyIndex && u !== '/') {
      out.push(...(await discoverIndexPageVariations(aposHost, aposKey, u, locale)));
    } else {
      out.push(u);
    }
  }
  return Array.from(new Set(out));
}


export async function generateSitemap(options = {}) {
  const {
    aposHost,
    aposKey,
    locale = null,
    pieceTypes
  } = options;

  if (!aposKey) {
    throw new Error("aposKey is required");
  }

  const headers = { "APOS-EXTERNAL-FRONT-KEY": aposKey };

  const pageUrls = await fetchAllPages(aposHost, headers, locale);

  let types = pieceTypes;
  if (!types) {
    types = await discoverPieceTypes(aposHost, headers, locale);
  }

  const pieceUrls = [];
  for (const pieceType of types) {
    const urls = await fetchAllPieces(aposHost, headers, pieceType, locale);
    pieceUrls.push(...urls);
  }

  let allUrls = Array.from(new Set([...pageUrls, ...pieceUrls])).sort();
  allUrls = await discoverAllIndexVariations(aposHost, aposKey, allUrls, locale);
  return allUrls;
}