"use strict";

const fs = require("fs");
const path = require("path");

const raw = JSON.parse(
  fs.readFileSync("raw_data.json", "utf8")
);

const items = Array.isArray(raw)
  ? raw
  : raw.records || raw.data || [];

if (!Array.isArray(items)) {
  throw new Error("Apps Script feed did not return an array.");
}

const gasUrl = String(process.env.GAS_URL || "").trim();

if (!gasUrl) {
  throw new Error("GAS_URL is required.");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeFileName(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

function jsString(value) {
  return JSON.stringify(String(value ?? ""));
}

function jsonForScript(value) {
  return JSON.stringify(value || {})
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function getSeo(item) {
  return item && item.seo && typeof item.seo === "object"
    ? item.seo
    : item || {};
}

function getKeywords(value) {
  return Array.isArray(value)
    ? value.map(String).filter(Boolean)
    : String(value || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

function pagePath(id) {
  return `pages/${safeFileName(id)}.html`;
}

function renderMedia(item, seo) {
  const videoUrl = seo.videoUrl ||
    (item.type === "video" ? item.url : "");
  const imageUrl = seo.imageUrl ||
    (item.type === "image" ? item.url : "");

  if (videoUrl) {
    return `
      <video class="hero-media" controls playsinline preload="metadata">
        <source src="${escapeHtml(videoUrl)}" type="video/mp4">
        Your browser does not support video playback.
      </video>
    `;
  }

  if (imageUrl) {
    return `
      <img
        class="hero-media"
        src="${escapeHtml(imageUrl)}"
        alt="${escapeHtml(seo.altText || seo.title || "Media review")}"
      >
    `;
  }

  return `<div class="hero-media media-missing">No media URL saved</div>`;
}

function renderComments(comments) {
  if (!Array.isArray(comments) || comments.length === 0) {
    return `<p class="muted">No comments yet. Be the first to share your thoughts.</p>`;
  }

  return comments
    .map((comment) => {
      const id = jsString(comment.commentId || "");
      const image = comment.imageUrl
        ? `<img src="${escapeHtml(comment.imageUrl)}" alt="Comment attachment">`
        : "";

      return `
        <article class="comment">
          <strong>${escapeHtml(comment.author || "Anonymous")}</strong>
          <span>${escapeHtml(comment.emoji || "")}</span>
          <p>${escapeHtml(comment.text || "")}</p>
          ${image}
          <button
            type="button"
            class="delete-comment"
            onclick="deleteComment(${id})"
          >
            Delete (Admin)
          </button>
        </article>
      `;
    })
    .join("");
}

function renderPage(item) {
  const seo = getSeo(item);
  const id = String(item.id);
  const title = seo.title || item.rawTitle || "Product Comparison Review";
  const description =
    seo.description ||
    "Detailed product comparison with media, specifications, and VIP upgrade intelligence.";
  const keywords = getKeywords(seo.keywords);
  const schema = seo.schema || {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: title,
    description
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="keywords" content="${escapeHtml(keywords.join(", "))}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <link rel="stylesheet" href="../style.css">
  <script type="application/ld+json">${jsonForScript(schema)}</script>
</head>
<body>
  <header class="site-header">
    <div>
      <p class="eyebrow">Full media review</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="site-subtitle">${escapeHtml(description)}</p>
    </div>
    <a class="button button-secondary" href="../index.html">Back to gallery</a>
  </header>

  <main class="review-main">
    <article class="review-card">
      <div class="review-media">${renderMedia(item, seo)}</div>
      <div class="review-copy">
        <p class="eyebrow">Comparison intelligence</p>
        <h2>What the specifications mean in practice</h2>
        <p>${escapeHtml(seo.comparison || "Comparison details are being prepared.")}</p>

        <div class="vip-banner">
          <strong>VIP upgrade intelligence</strong>
          <span>${escapeHtml(seo.vipTip || "Review trade-in, open-box, and real-cost options before upgrading.")}</span>
        </div>

        <div class="media-tags">
          ${keywords.map((keyword) => `<span class="tag">#${escapeHtml(keyword)}</span>`).join("")}
        </div>
      </div>
    </article>

    <section class="comments-section">
      <h2>Community comments</h2>
      <div id="comments-list">${renderComments(item.comments)}</div>
      <div class="comment-form">
        <input id="comment-author" placeholder="Your name">
        <textarea id="comment-text" rows="3" placeholder="Share your thoughts"></textarea>
        <div class="comment-form-row">
          <select id="comment-emoji">
            <option value="👍">Thumbs Up</option>
            <option value="❤️">Heart</option>
            <option value="🔥">Fire</option>
            <option value="💡">Insightful</option>
            <option value="⭐">Star</option>
          </select>
          <input id="comment-image" placeholder="Optional image URL">
        </div>
        <button class="button button-primary" type="button" onclick="postComment()">
          Post comment
        </button>
      </div>
    </section>
  </main>

  <script>
    const GAS_API_URL = ${jsString(gasUrl)};
    const MEDIA_ID = ${jsString(id)};

    async function callGas(payload) {
      const response = await fetch(GAS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(payload),
        redirect: "follow"
      });
      const text = (await response.text()).trim();
      if (!text) {
        throw new Error("The Apps Script response was empty.");
      }
      return JSON.parse(text);
    }

    async function postComment() {
      const text = document.getElementById("comment-text").value.trim();
      if (!text) {
        alert("Write a comment first.");
        return;
      }

      try {
        const result = await callGas({
          action: "add_comment",
          mediaId: MEDIA_ID,
          author: document.getElementById("comment-author").value.trim(),
          text,
          emoji: document.getElementById("comment-emoji").value,
          imageUrl: document.getElementById("comment-image").value.trim()
        });

        if (!result.success) {
          throw new Error(result.error || "Unable to post comment.");
        }

        location.reload();
      } catch (error) {
        alert(error.message);
      }
    }

    async function deleteComment(commentId) {
      const password = prompt("Enter admin password:");
      if (!password) {
        return;
      }

      try {
        const result = await callGas({
          action: "delete_comment",
          commentId,
          password
        });

        if (!result.success) {
          throw new Error(result.error || "Unable to delete comment.");
        }

        location.reload();
      } catch (error) {
        alert(error.message);
      }
    }
  </script>
</body>
</html>`;
}

fs.rmSync("pages", {
  recursive: true,
  force: true
});
fs.mkdirSync("pages", {
  recursive: true
});

const generatedLinks = [];

for (const item of items) {
  if (!item || !item.id) {
    continue;
  }

  const file = pagePath(item.id);
  fs.writeFileSync(file, renderPage(item));
  generatedLinks.push({
    item,
    file
  });
}

const indexSchema = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Cloudflare Media & Product Comparison Reviews",
  description: "Media-backed product comparisons and upgrade intelligence.",
  hasPart: generatedLinks.map(({ item, file }) => {
    const seo = getSeo(item);
    return {
      "@type": "TechArticle",
      headline: seo.title || item.rawTitle || "Product Comparison Review",
      description: seo.description || "",
      url: file
    };
  })
};

const indexTemplate = fs.readFileSync(
  "index.template.html",
  "utf8"
);

const indexHtml = indexTemplate
  .replace("{{INDEX_SCHEMA}}", `<script type="application/ld+json">${jsonForScript(indexSchema)}</script>`)
  .replace("{{ADMIN_URL}}", escapeHtml(`${gasUrl}?action=admin`));

fs.writeFileSync("index.html", indexHtml);
fs.writeFileSync(
  "data.json",
  JSON.stringify(items, null, 2) + "\n"
);

console.log(
  `Generated index.html, data.json, and ${generatedLinks.length} review pages.`
);