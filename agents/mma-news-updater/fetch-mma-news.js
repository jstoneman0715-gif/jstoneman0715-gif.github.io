import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(__dirname, 'mma-news.json');

// Extract fighter names and keywords from text
function extractFighterKeywords(text) {
  if (!text) return [];
  
  // Common MMA fighter names and keywords
  const fighterPatterns = [
    /\b(Conor|McGregor|Dustin|Poirier|Nate|Diaz|Jorge|Masvidal|Jon|Jones|Stipe|Miocic|Israel|Adesanya|Sean|Strickland)\b/gi,
    /\b(UFC|MMA|fighter|champion|knockout|KO|submission|belt)\b/gi,
  ];
  
  const keywords = [];
  for (const pattern of fighterPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      keywords.push(...matches.map(m => m.toLowerCase()));
    }
  }
  
  return [...new Set(keywords)];
}

// Search for fighter images using Wikimedia (preferred) and fall back to other sources
async function fetchFighterImage(searchQuery) {
  const queries = [searchQuery, ...extractFighterKeywords(searchQuery)];

  // Try Wikimedia Commons / Wikipedia first (no API key required)
  async function fetchWikimedia(query) {
    try {
      // Search for a relevant Wikipedia page
      const sres = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`).then(r => r.ok ? r.json() : null);
      const page = sres?.query?.search?.[0];
      if (!page) return null;
      const pageId = page.pageid;

      // Request page image (original or thumbnail)
      const pres = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=original|thumbnail&pageids=${pageId}&pithumbsize=800&format=json&origin=*`).then(r => r.ok ? r.json() : null);
      const pageObj = pres?.query?.pages?.[pageId];
      if (pageObj?.original?.source) return pageObj.original.source;
      if (pageObj?.thumbnail?.source) return pageObj.thumbnail.source;
    } catch (e) {
      // ignore
    }
    return null;
  }

  for (const query of queries) {
    // Wikimedia
    const wm = await fetchWikimedia(query);
    if (wm) {
      console.log(`  📸 Found Wikimedia image for: ${query}`);
      return wm;
    }

    // Try Unsplash if key present
    const unsplashKey = process.env.UNSPLASH_KEY;
    if (unsplashKey) {
      try {
        const unsplashRes = await fetch(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&client_id=${unsplashKey}`
        ).then(r => r.ok ? r.json() : null);
        if (unsplashRes?.results?.[0]?.urls?.regular) {
          console.log(`  📸 Found Unsplash image for: ${query}`);
          return unsplashRes.results[0].urls.regular;
        }
      } catch (e) {}
    }

    // Try Pexels if key present
    const pexelsKey = process.env.PEXELS_KEY;
    if (pexelsKey) {
      try {
        const pexelsRes = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`, { headers: { Authorization: pexelsKey } }).then(r => r.ok ? r.json() : null);
        if (pexelsRes?.photos?.[0]?.src?.large) {
          console.log(`  📸 Found Pexels image for: ${query}`);
          return pexelsRes.photos[0].src.large;
        }
      } catch (e) {}
    }

    // Try Pixabay if key present
    const pixabayKey = process.env.PIXABAY_KEY;
    if (pixabayKey) {
      try {
        const pixabayRes = await fetch(`https://pixabay.com/api/?q=${encodeURIComponent(query)}&image_type=photo&per_page=1&key=${pixabayKey}`).then(r => r.ok ? r.json() : null);
        if (pixabayRes?.hits?.[0]?.largeImageURL) {
          console.log(`  📸 Found Pixabay image for: ${query}`);
          return pixabayRes.hits[0].largeImageURL;
        }
      } catch (e) {}
    }
  }

  return null;
}

// Helper to download an image to a local file and return the repo-relative path
async function downloadImageToRepo(url, slugBase) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    const ext = contentType.split('/').pop().split(';')[0] || 'jpg';
    const safeExt = ext.split('?')[0];
    const fileName = `${slugBase}.${safeExt}`;
    const imagesDir = path.join(__dirname, 'images');
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
    const outPath = path.join(imagesDir, fileName);
    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(outPath, Buffer.from(arrayBuffer));
    // Return repo-relative web path
    return `/agents/mma-news-updater/images/${fileName}`;
  } catch (e) {
    return null;
  }
}

async function fetchMMANews() {
  const apiKey = process.env.NEWS_API_KEY;

  if (!apiKey) {
    console.error('❌ ERROR: NEWS_API_KEY environment variable not set');
    process.exit(1);
  }

  try {
    console.log('🔄 Fetching MMA news...');
    
    const response = await fetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent('"MMA" OR "UFC" OR "mixed martial arts"')}&sortBy=publishedAt&language=en&pageSize=20&apiKey=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.status !== 'ok') {
      throw new Error(`API returned error: ${data.message}`);
    }

    console.log('🔍 Processing articles and finding fighter images...');
    
    const articles = await Promise.all(
      data.articles.map(async (article, idx) => {
        let image = article.urlToImage;

        // Try to find a better fighter image if original is missing
        if (!image) {
          console.log(`  🔎 Searching for image: "${article.title ? article.title.substring(0, 50) : 'untitled'}..."`);
          image = await fetchFighterImage(article.title || article.description || 'MMA fighter');
        }

        // If we have an image URL, try to download it into the repo and return a local path
        let localImagePath = null;
        if (image) {
          // create a slug base from title + index
          const slugBase = (article.title || 'fighter').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + `-${idx}`;
          localImagePath = await downloadImageToRepo(image, slugBase);
          if (!localImagePath) {
            console.log(`  ⚠️ Failed to download image for: ${article.title}`);
          }
        }

        return {
          title: article.title,
          description: article.description,
          url: article.url,
          image: localImagePath || image || null,
          source: article.source.name,
          publishedAt: article.publishedAt,
          author: article.author,
        };
      })
    );

    // Ensure data directory exists
    const dataDir = path.dirname(dataFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Write to JSON file
    fs.writeFileSync(
      dataFile,
      JSON.stringify(
        {
          lastUpdated: new Date().toISOString(),
          articles: articles,
        },
        null,
        2
      )
    );

    const withImages = articles.filter(a => a.image).length;
    console.log(`✅ Success! Fetched ${articles.length} MMA articles`);
    console.log(`📸 ${withImages}/${articles.length} articles have images`);
    console.log(`📁 Saved to: ${dataFile}`);
    console.log(`⏰ Last updated: ${new Date().toISOString()}`);

    // Remove images left over from previous runs that no longer belong to any current article
    const imagesDir = path.join(__dirname, 'images');
    if (fs.existsSync(imagesDir)) {
      const referenced = new Set(
        articles
          .map(a => a.image)
          .filter(img => img && img.startsWith('/agents/mma-news-updater/images/'))
          .map(img => path.basename(img))
      );
      let removed = 0;
      for (const file of fs.readdirSync(imagesDir)) {
        if (!referenced.has(file)) {
          fs.unlinkSync(path.join(imagesDir, file));
          removed++;
        }
      }
      if (removed > 0) console.log(`🧹 Removed ${removed} orphaned image(s) from previous runs`);
    }
  } catch (error) {
    console.error('❌ Error fetching MMA news:', error.message);
    process.exit(1);
  }
}

fetchMMANews();
