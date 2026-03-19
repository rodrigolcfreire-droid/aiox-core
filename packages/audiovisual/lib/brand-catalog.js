#!/usr/bin/env node
'use strict';

/**
 * brand-catalog.js — Brand management system
 * Story: AV-8.1
 *
 * Catalogo de marcas com presets de identidade visual.
 * Cada marca tem logo, cores, overlay, estilo de legenda.
 */

const fs = require('fs');
const path = require('path');
const { AV_DIR } = require('./constants');

const CATALOG_PATH = path.join(AV_DIR, 'brand-catalog.json');

const DEFAULT_BRAND = {
  name: '',
  slug: '',
  logo: null,
  logoPosition: 'top-right',
  logoScale: 0.1,
  logoOpacity: 0.8,
  colors: { primary: '#ffffff', secondary: '#000000', accent: '#38bdf8' },
  subtitleStyle: 'minimal',
  overlay18: false,
  introVideo: null,
  outroVideo: null,
  watermark: null,
  tags: [],
  createdAt: null,
  updatedAt: null,
};

function loadCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) {
    return { brands: {}, updatedAt: null };
  }
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

function saveCatalog(catalog) {
  fs.mkdirSync(AV_DIR, { recursive: true });
  catalog.updatedAt = new Date().toISOString();
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function addBrand(name, config = {}) {
  const catalog = loadCatalog();
  const slug = slugify(name);

  if (catalog.brands[slug]) {
    throw new Error(`Brand "${name}" already exists (slug: ${slug})`);
  }

  const brand = {
    ...DEFAULT_BRAND,
    ...config,
    name,
    slug,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  catalog.brands[slug] = brand;
  saveCatalog(catalog);
  return brand;
}

function updateBrand(slug, updates) {
  const catalog = loadCatalog();
  if (!catalog.brands[slug]) {
    throw new Error(`Brand "${slug}" not found`);
  }

  catalog.brands[slug] = {
    ...catalog.brands[slug],
    ...updates,
    slug, // prevent slug change
    updatedAt: new Date().toISOString(),
  };

  saveCatalog(catalog);
  return catalog.brands[slug];
}

function removeBrand(slug) {
  const catalog = loadCatalog();
  if (!catalog.brands[slug]) {
    throw new Error(`Brand "${slug}" not found`);
  }

  const brand = catalog.brands[slug];
  delete catalog.brands[slug];
  saveCatalog(catalog);
  return brand;
}

function getBrand(slug) {
  const catalog = loadCatalog();
  if (!catalog.brands[slug]) {
    throw new Error(`Brand "${slug}" not found`);
  }
  return catalog.brands[slug];
}

function listBrands() {
  const catalog = loadCatalog();
  return Object.values(catalog.brands).sort((a, b) => a.name.localeCompare(b.name));
}

function getBrandPreset(slug) {
  const brand = getBrand(slug);
  return {
    logo: brand.logo,
    logoPosition: brand.logoPosition,
    logoScale: brand.logoScale,
    logoOpacity: brand.logoOpacity,
    subtitleStyle: brand.subtitleStyle,
    overlay18: brand.overlay18,
    introVideo: brand.introVideo,
    outroVideo: brand.outroVideo,
  };
}

module.exports = {
  loadCatalog,
  saveCatalog,
  addBrand,
  updateBrand,
  removeBrand,
  getBrand,
  listBrands,
  getBrandPreset,
  slugify,
  DEFAULT_BRAND,
  CATALOG_PATH,
};
