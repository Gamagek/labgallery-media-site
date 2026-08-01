// app.js
let globalData = [];

async function loadData() {
    const galleryGrid = document.getElementById('gallery');
    if (galleryGrid) {
        galleryGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: var(--card-bg); border-radius: 10px; border: 1px solid var(--border-color);">
                <div style="font-size: 1.5rem; margin-bottom: 10px;">⏳</div>
                <h3 style="margin: 0 0 5px 0; color: var(--text-main);">Loading Crawlable 2+ Product Comparison Intelligence...</h3>
                <p style="margin: 0; color: var(--text-muted);">Retrieving multi-device comparison specs, rich descriptions, and JSON-LD schema.</p>
            </div>
        `;
    }

    try {
        const response = await fetch('./data.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const rawJson = await response.json();
        globalData = Array.isArray(rawJson) ? rawJson : (rawJson.data || []);

        if (!Array.isArray(globalData) || globalData.length === 0) {
            if (galleryGrid) galleryGrid.innerHTML = '<p style="text-align:center; grid-column:1/-1;">No comparison reviews published yet.</p>';
            return;
        }

        renderCards(globalData);
        setupControls();
    } catch (err) {
        console.error('Fetch error:', err);
        if (galleryGrid) galleryGrid.innerHTML = '<p style="text-align:center; color:red; grid-column:1/-1;">Error loading data.json feed.</p>';
    }
}

function renderCards(items) {
    const galleryGrid = document.getElementById('gallery');
    const schemaContainer = document.getElementById('seo-schema-container') || document.head;
    
    if (!galleryGrid) return;
    galleryGrid.innerHTML = '';
    schemaContainer.innerHTML = '';
    
    items.forEach((item) => {
        const seo = item.seo || item;
        const title = seo.title || item.rawTitle || "2+ Product Comparison Review";
        const desc = seo.description || "Detailed long-form SEO specification analysis comparing two or more flagship models with VIP upgrade insights.";
        const videoUrl = seo.videoUrl || (item.type === 'video' ? item.url : "");
        const imageUrl = seo.imageUrl || (item.type === 'image' ? item.url : "");
        const alt = seo.altText || title;
        const keywordsRaw = seo.keywords || [];
        const keywords = typeof keywordsRaw === 'string' ? keywordsRaw.split(",") : keywordsRaw;

        const comparisonText = seo.comparison || "Comprehensive benchmark audit comparing two or more devices across optical sensors, chipsets, and performance thresholds.";
        const vipText = seo.vipTip || "Insider VIP Upgrade Trick: Avoid launch MSRP, leverage seasonal trade-in credits, or buy certified open-box inventory.";

        const article = document.createElement('article');
        article.className = 'media-card';
        article.setAttribute('itemscope', '');
        article.setAttribute('itemtype', 'https://schema.org/TechArticle');

        let mediaElement = '';
        if (videoUrl) {
            mediaElement = `<figure class="media-figure" style="margin:0;"><video controls preload="metadata" style="width:100%; height:240px; background:#000; object-fit:cover;"><source src="${videoUrl}" type="video/mp4">Your browser does not support video.</video></figure>`;
        } else if (imageUrl) {
            mediaElement = `<figure class="media-figure" style="margin:0;"><img src="${imageUrl}" alt="${alt}" loading="lazy" style="width:100%; height:240px; object-fit:cover;"></figure>`;
        }

        article.innerHTML = `
            ${mediaElement}
            <div class="media-info" style="padding: 20px;">
                <h2 class="media-title" itemprop="headline" style="font-size: 1.25rem; margin-bottom: 10px; font-weight: 700;">${title}</h2>
                <p class="media-desc" itemprop="description" style="font-size: 0.95rem; color: var(--text-muted); margin-bottom: 16px; line-height: 1.6;">${desc}</p>
                <div class="comparison-box" style="background: rgba(13, 110, 253, 0.08); border-left: 4px solid var(--accent); padding: 12px 14px; border-radius: 6px; font-size: 0.9rem; margin-bottom: 12px; line-height: 1.5;">
                    📊 <strong>2+ Product Web-Grounded Comparison:</strong> ${comparisonText}
                </div>
                <div class="vip-banner" style="background: rgba(227, 116, 0, 0.1); border-left: 4px solid var(--vip-color); padding: 12px 14px; border-radius: 6px; font-size: 0.9rem; color: var(--vip-color); margin-bottom: 16px; font-weight: 500; line-height: 1.5;">
                    🚀 <strong>VIP Upgrade Guidance & Pricing Tricks:</strong> ${vipText}
                </div>
                <div class="media-tags" style="display:flex; flex-wrap:wrap; gap:6px;">
                    ${keywords.map(tag => `<span class="tag" style="background:rgba(13,110,253,0.1); color:var(--accent); font-size:0.75rem; padding:4px 10px; border-radius:4px; font-weight: 500;">#${typeof tag === 'string' ? tag.trim() : tag}</span>`).join("")}
                </div>
            </div>
        `;
        galleryGrid.appendChild(article);

        const schemaObj = seo.schema;
        if (schemaObj && Object.keys(schemaObj).length > 0) {
            try {
                const scriptTag = document.createElement('script');
                scriptTag.type = 'application/ld+json';
                scriptTag.textContent = JSON.stringify(schemaObj);
                schemaContainer.appendChild(scriptTag);
            } catch (e) {
                console.warn("Schema insertion warning", e);
            }
        }
    });
}

function setupControls() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = globalData.filter(item => {
                const seo = item.seo || item;
                return (seo.title || "").toLowerCase().includes(query) || (seo.description || "").toLowerCase().includes(query);
            });
            renderCards(filtered);
        });
    }
}

document.addEventListener('DOMContentLoaded', loadData);
