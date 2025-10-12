/**
 * Example multi-locale configuration
 *
 * Use this when your site supports multiple languages
 */

export default {
  // Default locale (English) - no prefix
  en: {
    baseUrl: 'https://example.com',
    prefix: ''  // No prefix for default locale: example.com/about/
  },

  // Spanish
  es: {
    baseUrl: 'https://example.com/es',
    prefix: '/es'  // URLs will be: example.com/es/about/
  },

  // French
  fr: {
    baseUrl: 'https://example.com/fr',
    prefix: '/fr'  // URLs will be: example.com/fr/about/
  },

  // German
  de: {
    baseUrl: 'https://example.com/de',
    prefix: '/de'
  }
};

/**
 * Usage in apos-static.config.js:
 *
 * import localeConfig from './locales.config.js';
 *
 * export default {
 *   aposHost: 'http://localhost:3000',
 *   aposKey: process.env.APOS_EXTERNAL_FRONT_KEY,
 *   localeConfig
 * };
 */