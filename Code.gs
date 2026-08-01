/**
 * LabGallery Media Studio
 *
 * Deploy this file as a Google Apps Script Web App.
 *
 * Script Properties:
 *   GEMINI_KEY or GEMINI_API_KEY
 *   ADMIN_PASSWORD
 *   SPREADSHEET_ID (recommended)
 *   GEMINI_MODEL (optional, defaults to gemini-2.5-flash)
 */

var CONFIG = {
  SHEET_NAME: "media",
  COMMENTS_SHEET_NAME: "comments",
  PRIMARY_MODEL: "gemini-2.5-flash"
};

function doGet(e) {
  var action =
    e &&
    e.parameter &&
    e.parameter.action
      ? String(e.parameter.action).toLowerCase()
      : "json";

  if (action === "admin") {
    return serveAdminPanel();
  }

  return exportJSON();
}

function doPost(e) {
  try {
    var data = readRequestData(e);
    var action = String(data.action || "").toLowerCase();

    if (action === "verify_password" || action === "login") {
      return jsonResponse({
        success:
          String(data.password || "") === getAdminPassword()
      });
    }

    if (action === "run_grounding_comparison") {
      requireAdminPassword(data.password);

      var grounded = runGroundingComparison(
        data.comparisonQuery || data.query || "",
        data.videoUrl || "",
        data.imageUrl || "",
        getGeminiApiKey()
      );

      return jsonResponse({
        success: true,
        data: grounded
      });
    }

    if (action === "save_permanent") {
      requireAdminPassword(data.password);

      var message = saveRecordToSheet(data.record || {});

      return jsonResponse({
        success: true,
        message: message
      });
    }

    if (action === "compare") {
      var comparison = requestComparison(
        data.query || "General Comparison",
        getGeminiApiKey()
      );

      return jsonResponse({
        success: true,
        result: comparison
      });
    }

    if (action === "add_comment") {
      return addComment(data);
    }

    if (action === "delete_comment") {
      requireAdminPassword(data.password);
      return deleteComment(data.commentId);
    }

    throw new Error("Unknown action: " + action);
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error.toString()
    });
  }
}

function readRequestData(e) {
  if (
    e &&
    e.postData &&
    typeof e.postData.contents === "string" &&
    e.postData.contents
  ) {
    return JSON.parse(e.postData.contents);
  }

  if (e && e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }

  if (e && e.action) {
    return e;
  }

  throw new Error("Empty request payload");
}

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function getProperty(name) {
  return PropertiesService
    .getScriptProperties()
    .getProperty(name) || "";
}

function getAdminPassword() {
  var password = getProperty("ADMIN_PASSWORD");

  if (!password) {
    throw new Error(
      "ADMIN_PASSWORD is not configured in Script Properties."
    );
  }

  return password;
}

function requireAdminPassword(password) {
  if (String(password || "") !== getAdminPassword()) {
    throw new Error("Unauthorized");
  }
}

function getGeminiApiKey() {
  var key =
    getProperty("GEMINI_KEY") ||
    getProperty("GEMINI_API_KEY") ||
    getProperty("GOOGLE_API_KEY");

  if (!key) {
    throw new Error(
      "GEMINI_KEY is not configured in Script Properties."
    );
  }

  return key.trim();
}

function getGeminiModel() {
  return (
    getProperty("GEMINI_MODEL") ||
    CONFIG.PRIMARY_MODEL
  ).trim();
}

function getSpreadsheet() {
  var configuredId = getProperty("SPREADSHEET_ID").trim();

  if (configuredId) {
    return SpreadsheetApp.openById(configuredId);
  }

  var active = SpreadsheetApp.getActiveSpreadsheet();

  if (!active) {
    throw new Error(
      "Set SPREADSHEET_ID in Script Properties."
    );
  }

  return active;
}

function runGroundingComparison(query, videoUrl, imageUrl, apiKey) {
  var prompt = [
    "You are an elite technology market intelligence and SEO writer.",
    "Create an accurate, useful multi-product comparison for:",
    '"' + String(query).trim() + '"',
    "",
    "Use current public knowledge. Do not invent exact specifications.",
    "If a specification or price is uncertain, label it as an estimate.",
    "Return only valid JSON. Do not wrap it in Markdown fences.",
    "",
    "Required JSON shape:",
    "{",
    '  "title": "SEO title under 60 characters",',
    '  "description": "SEO meta description between 150 and 160 characters",',
    '  "keywords": "comma separated high intent keywords",',
    '  "altText": "accessible media description",',
    '  "comparison": "detailed comparison covering key specifications and practical differences",',
    '  "vipTip": "actionable upgrade, trade-in, open-box, and cost advice",',
    '  "schema": {',
    '    "@context": "https://schema.org",',
    '    "@type": "TechArticle",',
    '    "headline": "same title",',
    '    "description": "same description"',
    "  }",
    "}",
    "",
    "Media URLs to preserve:",
    'videoUrl: "' + String(videoUrl || "") + '"',
    'imageUrl: "' + String(imageUrl || "") + '"'
  ].join("\n");

  var responseJson = callGemini(
    prompt,
    apiKey,
    true
  );

  var candidateText = extractGeminiText(responseJson);

  if (!candidateText) {
    throw new Error(
      "Gemini returned no text. Finish reason: " +
      getFinishReason(responseJson) +
      ". Block reason: " +
      getBlockReason(responseJson)
    );
  }

  var record;

  try {
    record = JSON.parse(
      candidateText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim()
    );
  } catch (error) {
    throw new Error(
      "Gemini returned invalid comparison JSON: " +
      error.toString()
    );
  }

  record.videoUrl = String(videoUrl || "");
  record.imageUrl = String(imageUrl || "");

  if (!record.schema || typeof record.schema !== "object") {
    record.schema = {};
  }

  record.schema["@context"] =
    record.schema["@context"] ||
    "https://schema.org";
  record.schema["@type"] =
    record.schema["@type"] ||
    "TechArticle";
  record.schema.headline =
    record.schema.headline ||
    record.title ||
    "Product Comparison Review";
  record.schema.description =
    record.schema.description ||
    record.description ||
    "";

  return record;
}

function requestComparison(query, apiKey) {
  var prompt = [
    "Compare the following products:",
    String(query).trim(),
    "",
    "Return a useful Markdown comparison with these sections:",
    "1. Core Specs",
    "2. Key Differences",
    "3. VIP Upgrade Intelligence",
    "Include Upgrade Method Type, Performance Boost %, and Estimated Real Cost.",
    "Clearly identify estimates and avoid unsupported exact claims."
  ].join("\n");

  var responseJson = callGemini(
    prompt,
    apiKey,
    false
  );
  var text = extractGeminiText(responseJson);

  if (!text) {
    throw new Error(
      "Gemini returned no comparison text. Finish reason: " +
      getFinishReason(responseJson) +
      ". Block reason: " +
      getBlockReason(responseJson)
    );
  }

  return text;
}

function callGemini(prompt, apiKey, structuredJson) {
  var endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(getGeminiModel()) +
    ":generateContent?key=" +
    encodeURIComponent(apiKey);

  var generationConfig = {
    temperature: structuredJson ? 0.2 : 0.4,
    maxOutputTokens: structuredJson ? 4096 : 2048
  };

  if (structuredJson) {
    generationConfig.responseMimeType =
      "application/json";
  }

  var payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    tools: structuredJson
      ? [{ google_search: {} }]
      : undefined,
    generationConfig: generationConfig
  };

  var response = UrlFetchApp.fetch(endpoint, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();
  var responseText = response.getContentText();
  var json;

  try {
    json = JSON.parse(responseText);
  } catch (error) {
    throw new Error(
      "Gemini returned invalid JSON with HTTP " +
      status + ": " +
      error.toString()
    );
  }

  if (status < 200 || status >= 300) {
    throw new Error(
      "Gemini API HTTP " +
      status +
      ": " +
      getGeminiError(json, responseText)
    );
  }

  return json;
}

function extractGeminiText(responseJson) {
  var textParts = [];
  var candidates =
    responseJson &&
    Array.isArray(responseJson.candidates)
      ? responseJson.candidates
      : [];

  for (var i = 0; i < candidates.length; i++) {
    var parts =
      candidates[i] &&
      candidates[i].content &&
      Array.isArray(candidates[i].content.parts)
        ? candidates[i].content.parts
        : [];

    for (var j = 0; j < parts.length; j++) {
      if (
        parts[j] &&
        typeof parts[j].text === "string" &&
        parts[j].text.trim()
      ) {
        textParts.push(parts[j].text.trim());
      }
    }
  }

  return textParts.join("\n\n").trim();
}

function getFinishReason(responseJson) {
  return responseJson &&
    responseJson.candidates &&
    responseJson.candidates[0] &&
    responseJson.candidates[0].finishReason
    ? String(responseJson.candidates[0].finishReason)
    : "none";
}

function getBlockReason(responseJson) {
  return responseJson &&
    responseJson.promptFeedback &&
    responseJson.promptFeedback.blockReason
    ? String(responseJson.promptFeedback.blockReason)
    : "none";
}

function getGeminiError(json, fallback) {
  return json &&
    json.error &&
    json.error.message
    ? json.error.message
    : fallback;
}

function getSheet() {
  var spreadsheet = getSpreadsheet();
  var sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow([
      "id",
      "type",
      "url",
      "rawTitle",
      "category",
      "seometadata"
    ]);
  }

  return sheet;
}

function saveRecordToSheet(record) {
  var sheet = getSheet();
  var id =
    String(record.id || "").trim() ||
    "item-" + new Date().getTime();
  var mediaUrl =
    String(record.videoUrl || record.imageUrl || "").trim();
  var mediaType = record.videoUrl ? "video" : "image";
  var title =
    String(record.title || "Product Comparison Review").trim();
  var metadata = {
    title: title,
    description: String(record.description || ""),
    keywords: record.keywords || "",
    altText: String(record.altText || title),
    schema: record.schema || {},
    comparison: String(record.comparison || ""),
    vipTip: String(record.vipTip || ""),
    videoUrl: String(record.videoUrl || ""),
    imageUrl: String(record.imageUrl || "")
  };

  var values = sheet.getDataRange().getValues();
  var rowToUpdate = -1;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === id) {
      rowToUpdate = i + 1;
      break;
    }
  }

  var row = [
    id,
    mediaType,
    mediaUrl,
    title,
    "Cloudflare Media Review",
    JSON.stringify(metadata)
  ];

  if (rowToUpdate > 0) {
    sheet
      .getRange(rowToUpdate, 1, 1, row.length)
      .setValues([row]);
  } else {
    sheet.appendRow(row);
  }

  return "Saved permanently to the media sheet. GitHub Actions will publish the page.";
}

function exportJSON() {
  var sheet = getSheet();
  var values = sheet.getDataRange().getValues();
  var comments = getCommentsByMediaId();
  var data = [];

  for (var i = 1; i < values.length; i++) {
    if (!values[i][0]) {
      continue;
    }

    var metadata = {};

    try {
      metadata = values[i][5]
        ? JSON.parse(values[i][5])
        : {};
    } catch (error) {
      metadata = {};
    }

    var id = String(values[i][0]);
    var seo = metadata;

    data.push({
      id: id,
      type: values[i][1] || "image",
      url: values[i][2] || "",
      rawTitle: values[i][3] || seo.title || "",
      category: values[i][4] || "",
      seo: seo,
      comments: comments[id] || []
    });
  }

  return jsonResponse(data);
}

function getCommentsSheet() {
  var spreadsheet = getSpreadsheet();
  var sheet = spreadsheet.getSheetByName(
    CONFIG.COMMENTS_SHEET_NAME
  );

  if (!sheet) {
    sheet = spreadsheet.insertSheet(
      CONFIG.COMMENTS_SHEET_NAME
    );
    sheet.appendRow([
      "commentId",
      "mediaId",
      "author",
      "text",
      "emoji",
      "imageUrl",
      "timestamp"
    ]);
  }

  return sheet;
}

function addComment(data) {
  var sheet = getCommentsSheet();
  var commentId = "comment-" + new Date().getTime();

  sheet.appendRow([
    commentId,
    data.mediaId || "",
    data.author || "Anonymous",
    data.text || "",
    data.emoji || "👍",
    data.imageUrl || "",
    new Date().toISOString()
  ]);

  return jsonResponse({
    success: true,
    commentId: commentId
  });
}

function deleteComment(commentId) {
  var sheet = getCommentsSheet();
  var values = sheet.getDataRange().getValues();

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(commentId || "")) {
      sheet.deleteRow(i + 1);
      return jsonResponse({ success: true });
    }
  }

  throw new Error("Comment not found");
}

function getCommentsByMediaId() {
  var sheet = getCommentsSheet();
  var values = sheet.getDataRange().getValues();
  var grouped = {};

  for (var i = 1; i < values.length; i++) {
    var mediaId = String(values[i][1] || "");

    if (!grouped[mediaId]) {
      grouped[mediaId] = [];
    }

    grouped[mediaId].push({
      commentId: values[i][0],
      mediaId: values[i][1],
      author: values[i][2],
      text: values[i][3],
      emoji: values[i][4],
      imageUrl: values[i][5],
      timestamp: values[i][6]
    });
  }

  return grouped;
}

function serveAdminPanel() {
  var template = HtmlService.createTemplate(
    ADMIN_HTML
  );

  return template
    .evaluate()
    .setTitle("Cloudflare Media Studio")
    .setXFrameOptionsMode(
      HtmlService.XFrameOptionsMode.ALLOWALL
    );
}

var ADMIN_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cloudflare Media Studio</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      color: #172033;
      background: #f5f7fb;
      font-family: system-ui, sans-serif;
    }
    .wrap {
      width: min(860px, 100%);
      margin: 0 auto;
      padding: 24px;
      border: 1px solid #e1e7f0;
      border-radius: 16px;
      background: #fff;
      box-shadow: 0 18px 50px rgba(28,48,86,.08);
    }
    .group { margin-bottom: 16px; }
    label {
      display: block;
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: 750;
    }
    input, textarea {
      width: 100%;
      padding: 11px 12px;
      border: 1px solid #d8e0ec;
      border-radius: 8px;
      box-sizing: border-box;
      font: inherit;
    }
    textarea { min-height: 92px; resize: vertical; }
    button {
      width: 100%;
      padding: 12px 16px;
      border: 0;
      border-radius: 8px;
      color: #fff;
      background: #235fe7;
      font-weight: 750;
      cursor: pointer;
    }
    button.secondary { background: #198754; }
    .hidden { display: none; }
    .status { min-height: 22px; color: #637089; }
    .error { color: #b42318; }
    .success { color: #137333; }
  </style>
</head>
<body>
  <main class="wrap">
    <h1>Cloudflare Media Studio</h1>
    <p>Save each Cloudflare video or image with permanent SEO comparison metadata.</p>

    <section id="login-section">
      <div class="group">
        <label for="admin-password">Admin password</label>
        <input id="admin-password" type="password">
      </div>
      <button type="button" onclick="login()">Unlock Studio</button>
      <p id="login-status" class="status"></p>
    </section>

    <section id="studio-section" class="hidden">
      <div class="group">
        <label for="video-url">Cloudflare video URL</label>
        <input id="video-url" type="url" placeholder="https://pub-....r2.dev/review.mp4">
      </div>

      <div class="group">
        <label for="image-url">Poster or banner image URL (optional)</label>
        <input id="image-url" type="url">
      </div>

      <div class="group">
        <label for="comparison-query">Products to compare</label>
        <input
          id="comparison-query"
          value="Google Pixel 9 Pro vs Samsung Galaxy S24 Ultra vs iPhone 16 Pro Max"
        >
      </div>

      <button type="button" onclick="runGrounding()">
        Generate SEO comparison
      </button>

      <p id="generation-status" class="status"></p>

      <div id="results-section" class="hidden">
        <div class="group">
          <label for="edit-title">SEO title</label>
          <input id="edit-title">
        </div>
        <div class="group">
          <label for="edit-description">Meta description</label>
          <textarea id="edit-description"></textarea>
        </div>
        <div class="group">
          <label for="edit-keywords">Keywords</label>
          <input id="edit-keywords">
        </div>
        <div class="group">
          <label for="edit-comparison">Comparison description</label>
          <textarea id="edit-comparison"></textarea>
        </div>
        <div class="group">
          <label for="edit-vip">VIP upgrade guidance</label>
          <textarea id="edit-vip"></textarea>
        </div>
        <button class="secondary" type="button" onclick="savePermanent()">
          Save media permanently and publish to feed
        </button>
        <p id="save-status" class="status"></p>
      </div>
    </section>
  </main>

  <script>
    var currentPassword = "";
    var currentRecord = {};

    function callServer(action, extra) {
      var payload = Object.assign(
        { action: action },
        extra || {}
      );

      return new Promise(function(resolve) {
        google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler(function(error) {
            resolve({
              success: false,
              error: error.message || String(error)
            });
          })
          .doPost({
            postData: {
              contents: JSON.stringify(payload)
            }
          });
      });
    }

    function login() {
      var password =
        document.getElementById("admin-password").value;
      var status =
        document.getElementById("login-status");

      callServer("verify_password", {
        password: password
      }).then(function(result) {
        if (result.success) {
          currentPassword = password;
          document
            .getElementById("login-section")
            .classList.add("hidden");
          document
            .getElementById("studio-section")
            .classList.remove("hidden");
        } else {
          status.className = "status error";
          status.textContent = "Incorrect password.";
        }
      });
    }

    function runGrounding() {
      var status =
        document.getElementById("generation-status");
      var query =
        document.getElementById("comparison-query").value;
      var videoUrl =
        document.getElementById("video-url").value;
      var imageUrl =
        document.getElementById("image-url").value;

      if (!videoUrl && !imageUrl) {
        status.className = "status error";
        status.textContent =
          "Add a Cloudflare video URL or poster image URL first.";
        return;
      }

      status.className = "status";
      status.textContent = "Generating comparison metadata…";

      callServer("run_grounding_comparison", {
        password: currentPassword,
        comparisonQuery: query,
        videoUrl: videoUrl,
        imageUrl: imageUrl
      }).then(function(result) {
        if (!result.success) {
          status.className = "status error";
          status.textContent = result.error;
          return;
        }

        currentRecord = result.data || {};
        document.getElementById("edit-title").value =
          currentRecord.title || "";
        document.getElementById("edit-description").value =
          currentRecord.description || "";
        document.getElementById("edit-keywords").value =
          currentRecord.keywords || "";
        document.getElementById("edit-comparison").value =
          currentRecord.comparison || "";
        document.getElementById("edit-vip").value =
          currentRecord.vipTip || "";
        document
          .getElementById("results-section")
          .classList.remove("hidden");
        status.className = "status success";
        status.textContent =
          "Generated. Review the fields, then save permanently.";
      });
    }

    function savePermanent() {
      currentRecord.title =
        document.getElementById("edit-title").value;
      currentRecord.description =
        document.getElementById("edit-description").value;
      currentRecord.keywords =
        document.getElementById("edit-keywords").value;
      currentRecord.comparison =
        document.getElementById("edit-comparison").value;
      currentRecord.vipTip =
        document.getElementById("edit-vip").value;
      currentRecord.videoUrl =
        document.getElementById("video-url").value;
      currentRecord.imageUrl =
        document.getElementById("image-url").value;

      var status =
        document.getElementById("save-status");
      status.className = "status";
      status.textContent = "Saving to Google Sheets…";

      callServer("save_permanent", {
        password: currentPassword,
        record: currentRecord
      }).then(function(result) {
        status.className =
          result.success
            ? "status success"
            : "status error";
        status.textContent =
          result.success
            ? result.message
            : result.error;
      });
    }
  </script>
</body>
</html>
`;