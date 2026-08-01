# LabGallery Media Review Export

This package contains the Cloudflare media gallery, Google Apps Script backend, SEO page generator, and GitHub Actions workflow.

## Files

- `Code.gs` — Google Apps Script Web App backend and Media Studio.
- `app.js` — gallery feed loader, search, media cards, and JSON-LD injection.
- `index.template.html` — source template for the generated home page.
- `style.css` — gallery and full-review page styles.
- `generate-pages.js` — generates `index.html`, `data.json`, and `pages/*.html`.
- `.github/workflows/update-media.yml` — downloads the Apps Script feed and commits generated pages.
- `original-uploaded-snapshot.txt` — original uploaded reference snapshot.

## Google Apps Script setup

1. Create or open the Apps Script project connected to your Google Sheet.
2. Paste the contents of `Code.gs` into the project.
3. Set these Script Properties:

   - `GEMINI_KEY` — Gemini API key.
   - `ADMIN_PASSWORD` — Media Studio password.
   - `SPREADSHEET_ID` — Google Sheet ID.
   - `GEMINI_MODEL` — optional; defaults to `gemini-2.5-flash`.

4. Deploy as a Web App.
5. Set execution to your account and access to anyone who needs to use the Web App.
6. Copy the deployed URL ending in `/exec`.

## GitHub setup

1. Copy `GAS_URL` into GitHub repository Secrets.
2. Set `GAS_URL` to the deployed Apps Script `/exec` URL.
3. Keep the repository files at the repository root.
4. Run the `Update Media Data & Generate Pages` workflow manually once.

The workflow generates:

- `index.html`
- `data.json`
- `pages/<media-id>.html`

Each saved Cloudflare video is rendered as a full-view video page with SEO metadata, Open Graph tags, JSON-LD schema, comparison content, VIP upgrade guidance, and comments.
