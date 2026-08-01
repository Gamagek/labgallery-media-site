"use strict";

let globalData = [];
let searchListenerAttached = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getSeo(item) {
  return item && item.seo && typeof item.seo === "object"
    ? item.seo
    : item || {};
}

function getItemUrl(item, seo) {
  return seo.videoUrl ||
    seo.imageUrl ||
    item.url ||
    "";
}

function getPageFileName(id) {
  return String(id || "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getKeywords(value) {
  if (Array.isArray(value)) {
    return value
      .map((keyword) => String(keyword).trim())
      .filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

async function loadData() {
  const galleryGrid = document.getElementById("gallery");

  if (galleryGrid) {
    galleryGrid.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner" aria-hidden="true"></div>
        <h2>Loading comparison intelligence…</h2>
        <p>Retrieving media, specifications, and SEO review data.</p>
      </div>
    `;
  }

  try {
    const response = await fetch("./data.json", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const rawJson = await response.json();

    globalData = Array.isArray(rawJson)
      ? rawJson
      : rawJson.records || rawJson.data || [];

    if (!Array.isArray(globalData) || globalData.length === 0) {
      if (galleryGrid) {
        galleryGrid.innerHTML = `
          <div class="empty-state">
            <h2>No reviews published yet</h2>
            <p>Add your first Cloudflare media item from the Apps Script Media Studio.</p>
          </div>
        `;
      }
      return;
    }

    renderCards(globalData);
    setupControls();
  } catch (error) {
    console.error("Feed loading error:", error);

    if (galleryGrid) {
      galleryGrid.innerHTML = `
        <div class="error-state">
          <h2>Unable to load the media feed</h2>
          <p>Run the GitHub sync workflow and try again.</p>
        </div>
      `;
    }
  }
}

function renderCards(items) {
  const galleryGrid = document.getElementById("gallery");
  const schemaContainer =
    document.getElementById("seo-schema-container") ||
    document.head;

  if (!galleryGrid) {
    return;
  }

  galleryGrid.innerHTML = "";
  schemaContainer
    .querySelectorAll('script[data-review-schema="true"]')
    .forEach((script) => script.remove());

  items.forEach((item) => {
    const seo = getSeo(item);
    const title =
      seo.title ||
      item.rawTitle ||
      "Product Comparison Review";
    const description =
      seo.description ||
      "Detailed multi-product comparison with specifications and upgrade intelligence.";
    const mediaUrl = getItemUrl(item, seo);
    const isVideo =
      Boolean(seo.videoUrl) ||
      String(item.type || "").toLowerCase() === "video";
    const keywords = getKeywords(seo.keywords);
    const id = String(item.id || "");
    const pageUrl = `pages/${getPageFileName(id)}.html`;

    const article = document.createElement("article");
    article.className = "media-card";
    article.setAttribute("itemscope", "");
    article.setAttribute("itemtype", "https://schema.org/TechArticle");

    const mediaElement = mediaUrl
      ? isVideo
        ? `
          <figure class="media-figure">
            <video controls preload="metadata" playsinline>
              <source src="${escapeHtml(mediaUrl)}" type="video/mp4">
              Your browser does not support video playback.
            </video>
          </figure>
        `
        : `
          <figure class="media-figure">
            <img
              src="${escapeHtml(mediaUrl)}"
              alt="${escapeHtml(seo.altText || title)}"
              loading="lazy"
            >
          </figure>
        `
      : `
        <div class="media-placeholder">
          No media preview available
        </div>
      `;

    const keywordMarkup = keywords
      .map(
        (keyword) =>
          `<span class="tag">#${escapeHtml(keyword)}</span>`
      )
      .join("");

    article.innerHTML = `
      ${mediaElement}
      <div class="media-info">
        <p class="eyebrow">Verified media review</p>
        <h2 class="media-title" itemprop="headline">
          ${escapeHtml(title)}
        </h2>
        <p class="media-desc" itemprop="description">
          ${escapeHtml(description)}
        </p>
        <div class="comparison-box">
          <strong>Comparison intelligence</strong>
          <span>
            ${escapeHtml(
              seo.comparison ||
                "Detailed specifications, performance, and value analysis."
            )}
          </span>
        </div>
        <div class="vip-banner">
          <strong>VIP upgrade guidance</strong>
          <span>
            ${escapeHtml(
              seo.vipTip ||
                "Compare trade-in credits, open-box pricing, and real upgrade value."
            )}
          </span>
        </div>
        <div class="media-card-footer">
          <div class="media-tags">${keywordMarkup}</div>
          <a class="button button-secondary" href="${escapeHtml(pageUrl)}">
            Open full review
          </a>
        </div>
      </div>
    `;

    galleryGrid.appendChild(article);

    if (seo.schema && typeof seo.schema === "object") {
      const schemaTag = document.createElement("script");
      schemaTag.type = "application/ld+json";
      schemaTag.dataset.reviewSchema = "true";
      schemaTag.textContent = JSON.stringify(seo.schema);
      schemaContainer.appendChild(schemaTag);
    }
  });
}

function setupControls() {
  const searchInput = document.getElementById("search-input");

  if (!searchInput || searchListenerAttached) {
    return;
  }

  searchListenerAttached = true;

  searchInput.addEventListener("input", (event) => {
    const query = event.target.value.toLowerCase().trim();

    const filtered = globalData.filter((item) => {
      const seo = getSeo(item);
      const searchableText = [
        seo.title,
        seo.description,
        seo.comparison,
        seo.vipTip,
        seo.keywords,
        item.rawTitle,
        item.category
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });

    renderCards(filtered);
  });
}

document.addEventListener("DOMContentLoaded", loadData);