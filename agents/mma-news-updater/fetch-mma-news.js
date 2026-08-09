import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(__dirname, '../src/data/mma-news.json');

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

// Search for fighter images across multiple free APIs
async function fetchFighterImage(searchQuery) {
  const queries = [searchQuery, ...extractFighterKeywords(searchQuery)];
  
  for (const query of queries) {
    try {
      // Try Unsplash (free, no auth required)
      const unsplashRes = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&client_id=cJv9DBiCqRZBj6t9vGtcnG9Yj2h7vAP2iXjfW2RzWH0`
      ).then(r => r.ok ? r.json() : null);
      
      if (unsplashRes?.results?.[0]?.urls?.regular) {
        console.log(`  📸 Found Unsplash image for: ${query}`);
        return unsplashRes.results[0].urls.regular;
      }
    } catch (e) {
      // Continue to next source
    }
    
    try {
      // Try Pexels (free, no auth required)
      const pexelsRes = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&client_id=563492ad6f91700001000001`
      ).then(r => r.ok ? r.json() : null);
      
      if (pexelsRes?.photos?.[0]?.src?.large) {
        console.log(`  📸 Found Pexels image for: ${query}`);
        return pexelsRes.photos[0].src.large;
      }
    } catch (e) {
      // Continue to next source
    }
    
    try {
      // Try Pixabay (free, no auth required)
      const pixabayRes = await fetch(
        `https://pixabay.com/api/?q=${encodeURIComponent(query)}&image_type=photo&per_page=1&key=43292100-68a1cc19f7c3b4d8a1ff3e000`
      ).then(r => r.ok ? r.json() : null);
      
      if (pixabayRes?.hits?.[0]?.largeImageURL) {
        console.log(`  📸 Found Pixabay image for: ${query}`);
        return pixabayRes.hits[0].largeImageURL;
      }
    } catch (e) {
      // Continue to next source
    }
  }
  
  return null;
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
      `https://newsapi.org/v2/everything?q=MMA&sortBy=publishedAt&language=en&pageSize=20&apiKey=${apiKey}`
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
      data.articles.map(async (article) => {
        let image = article.urlToImage;
        
        // Try to find a better fighter image if original is missing
        if (!image) {
          console.log(`  🔎 Searching for image: "${article.title.substring(0, 50)}..."`);
          image = await fetchFighterImage(article.title);
        }
        
        return {
          title: article.title,
          description: article.description,
          url: article.url,
          image: image,
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
  } catch (error) {
    console.error('❌ Error fetching MMA news:', error.message);
    process.exit(1);
  }
}

fetchMMANews();
