name: Update All RSS Feeds

on:
  schedule:
    - cron: '*/30 * * * *'  # Co 30 minut
  push:
    branches: [ main ]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  update-all-feeds:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout repository
      uses: actions/checkout@v4
      with:
        token: ${{ secrets.GITHUB_TOKEN }}
        
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        
    - name: Update all RSS feeds
      env:
        GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
      run: |
        cat > update-all-feeds.js << 'EOF'
        const https = require('https');
        const fs = require('fs');
        
        const GROQ_API_KEY = process.env.GROQ_API_KEY;
        
        // === WSPÓLNE FUNKCJE ===
        
        function delay(ms) {
          return new Promise(resolve => setTimeout(resolve, ms));
        }
        
        function calculateSimilarity(text1, text2) {
          const words1 = text1.toLowerCase().split(/\s+/);
          const words2 = text2.toLowerCase().split(/\s+/);
          
          const set1 = new Set(words1);
          const set2 = new Set(words2);
          
          const intersection = new Set([...set1].filter(x => set2.has(x)));
          const union = new Set([...set1, ...set2]);
          
          return intersection.size / union.size;
        }
        
        // === GROQ API FUNCTIONS ===
        
        async function enhanceTitleWithGroq(originalTitle) {
          if (!GROQ_API_KEY) return originalTitle;
          
          const prompt = "ZADANIE: Przepisz tytuł artykułu informacyjnego na bardziej neutralny i faktyczny.\n\n" +
            "WYMAGANIA:\n" +
            "- Usuń clickbaitowe elementy\n" +
            "- Zachowaj wszystkie fakty\n" +
            "- Napisz w stylu informacyjnym, nie sensacyjnym\n" +
            "- Bez cudzysłowów i wykrzykników\n" +
            "- Maksymalnie 80 znaków\n" +
            "- Precyzyjny i merytoryczny ton\n\n" +
            "ORYGINALNY TYTUŁ:\n" +
            originalTitle + "\n\n" +
            "PRZEPISANY TYTUŁ:";
        
          const requestData = JSON.stringify({
            messages: [
              {
                role: "system",
                content: "Jesteś redaktorem prasowym specjalizującym się w pisaniu neutralnych, informacyjnych tytułów bez clickbaitu."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.3,
            max_tokens: 100,
            top_p: 0.9
          });
        
          return new Promise((resolve) => {
            const options = {
              hostname: 'api.groq.com',
              path: '/openai/v1/chat/completions',
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + GROQ_API_KEY,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestData)
              },
              timeout: 15000
            };
        
            const req = https.request(options, (res) => {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => {
                try {
                  if (res.statusCode !== 200) {
                    console.log('Groq API error for title:', res.statusCode);
                    resolve(originalTitle);
                    return;
                  }
                  
                  const response = JSON.parse(data);
                  let enhancedTitle = response.choices[0].message.content.trim();
                  enhancedTitle = enhancedTitle.replace(/^["']|["']$/g, '');
                  
                  console.log('Enhanced title:', enhancedTitle);
                  resolve(enhancedTitle);
                  
                } catch (error) {
                  console.log('Title enhancement error:', error);
                  resolve(originalTitle);
                }
              });
            });
        
            req.on('error', () => resolve(originalTitle));
            req.on('timeout', () => {
              req.destroy();
              resolve(originalTitle);
            });
        
            req.setTimeout(15000);
            req.write(requestData);
            req.end();
          });
        }
        
        async function enhanceDescriptionWithGroq(title, originalDescription) {
          if (!GROQ_API_KEY) return originalDescription;
          
          const prompt = "ZADANIE: Przekształć ten opis artykułu w listę punktową wszystkich informacji.\n\n" +
            "WYMAGANIA:\n" +
            "- Wypunktuj WSZYSTKIE informacje z opisu\n" +
            "- Każdy punkt w nowej linii z • na początku\n" +
            "- Zachowaj wszystkie szczegóły (liczby, miejsca, osoby)\n" +
            "- Nie skracaj ani nie pomijaj żadnych danych\n" +
            "- NIE DUPLIKUJ informacji z tytułu w punktach\n" +
            "- Nie dodawaj własnych komentarzy\n" +
            "- Tylko faktyczne informacje z tekstu opisu\n\n" +
            "Opis artykułu: " + originalDescription + "\n\n" +
            "LISTA PUNKTOWA:";
        
          const requestData = JSON.stringify({
            messages: [
              {
                role: "system",
                content: "Jesteś ekspertem od strukturyzowania informacji. Zawsze przekształcasz tekst w przejrzystą listę punktową zachowując wszystkie szczegóły."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.2,
            max_tokens: 500,
            top_p: 0.9
          });
        
          return new Promise((resolve) => {
            const options = {
              hostname: 'api.groq.com',
              path: '/openai/v1/chat/completions',
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestData)
              },
              timeout: 15000
            };
        
            const req = https.request(options, (res) => {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => {
                try {
                  if (res.statusCode !== 200) {
                    console.log(`Groq API error ${res.statusCode}:`, data);
                    resolve(originalDescription);
                    return;
                  }
                  
                  const response = JSON.parse(data);
                  let enhancedText = response.choices[0].message.content.trim();
                  enhancedText = enhancedText.replace(/^["']|["']$/g, '');
                  
                  const similarity = calculateSimilarity(originalDescription, enhancedText);
                  if (similarity > 0.8) {
                    console.log(`Tekst zbyt podobny (${Math.round(similarity * 100)}%), pozostawiam oryginalny...`);
                    resolve(originalDescription);
                  } else {
                    console.log(`Enhanced (${Math.round(similarity * 100)}% podobieństwo): ${enhancedText.substring(0, 50)}...`);
                    resolve(enhancedText);
                  }
                } catch (error) {
                  console.log('JSON parse error:', error);
                  resolve(originalDescription);
                }
              });
            });
        
            req.on('error', (error) => {
              console.log('Groq request error:', error);
              resolve(originalDescription);
            });
        
            req.on('timeout', () => {
              console.log('Groq request timeout');
              req.destroy();
              resolve(originalDescription);
            });
        
            req.setTimeout(15000);
            req.write(requestData);
            req.end();
          });
        }
        
        // === RSS FETCH FUNCTIONS ===
        
        function fetchRSS(hostname, path) {
          return new Promise((resolve, reject) => {
            const options = {
              hostname: hostname,
              path: path,
              method: 'GET',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/rss+xml, application/xml, text/xml',
                'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache'
              },
              timeout: 10000
            };
            
            const req = https.request(options, (res) => {
              if (res.statusCode === 301 || res.statusCode === 302) {
                const location = res.headers.location;
                if (location) {
                  const url = new URL(location);
                  const newOptions = {
                    hostname: url.hostname,
                    path: url.pathname + url.search,
                    method: 'GET',
                    headers: options.headers,
                    timeout: 10000
                  };
                  
                  const redirectReq = https.request(newOptions, (redirectRes) => {
                    if (redirectRes.statusCode !== 200) {
                      reject(new Error(`HTTP ${redirectRes.statusCode}`));
                      return;
                    }
                    
                    let data = '';
                    redirectRes.on('data', chunk => data += chunk);
                    redirectRes.on('end', () => resolve(data));
                  });
                  
                  redirectReq.on('error', reject);
                  redirectReq.setTimeout(10000);
                  redirectReq.end();
                  return;
                }
              }
              
              if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
              }
              
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => resolve(data));
            });
            
            req.on('error', reject);
            req.on('timeout', () => {
              req.destroy();
              reject(new Error('Request timeout'));
            });
            
            req.setTimeout(10000);
            req.end();
          });
        }
        
        // === RSS PARSING ===
        
        function parseRSS(xml, maxItems = 15) {
          const items = [];
          const itemParts = xml.split('<item>');
          
          for (let i = 1; i < itemParts.length; i++) {
            const item = itemParts[i].split('</item>')[0];
            
            let title = '';
            let link = '';
            let pubDate = '';
            let description = '';
            
            // Parsowanie tytułu
            const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || 
                              item.match(/<title>(.*?)<\/title>/);
            if (titleMatch) title = titleMatch[1];
            
            // Parsowanie linku
            const linkMatch = item.match(/<link>(.*?)<\/link>/);
            if (linkMatch) link = linkMatch[1];
            
            // Parsowanie daty
            const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
            if (dateMatch) pubDate = dateMatch[1];
            
            // Parsowanie opisu
            const descMatch = item.match(/<description>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/description>/) ||
                             item.match(/<description>([\s\S]*?)<\/description>/);
            if (descMatch) {
              let rawDesc = descMatch[1];
              description = rawDesc.replace(/<[^>]*>/g, '').trim();
              description = description.replace(/\s+/g, ' ').trim();
            }
            
            if (title && link) {
              items.push({
                title: title.trim(),
                link: link.trim(),
                pubDate: pubDate.trim(),
                description: description || 'Brak opisu'
              });
            }
            
            if (items.length >= maxItems) break;
          }
          
          return items;
        }
        
        // === UPDATE FUNCTIONS ===
        
        async function updateNews() {
          try {
            console.log('\\n=== AKTUALIZACJA WIADOMOŚCI ===');
            const xml = await fetchRSS('tvn24.pl', '/najnowsze.xml');
            const articles = parseRSS(xml, 10);
            
            console.log(`Pobrano ${articles.length} artykułów, ulepszanie z Groq...`);
            
            // Ulepszanie z Groq (tylko dla głównych wiadomości)
            for (let i = 0; i < articles.length; i++) {
              const article = articles[i];
              
              if (article.description && article.description !== 'Brak opisu') {
                console.log(`Przetwarzanie ${i + 1}/${articles.length}: ${article.title.substring(0, 50)}...`);
                
                const enhancedTitle = await enhanceTitleWithGroq(article.title);
                await delay(1500);
                
                const enhancedDescription = await enhanceDescriptionWithGroq(
                  article.title,
                  article.description
                );
                
                articles[i].originalTitle = article.title;
                articles[i].originalDescription = article.description;
                articles[i].title = enhancedTitle;
                articles[i].description = enhancedDescription;
                
                if (i < articles.length - 1) {
                  await delay(2000);
                }
              }
            }
            
            const data = {
              lastUpdate: new Date().toISOString(),
              enhancedWithGroq: true,
              groqApiKeyExists: !!GROQ_API_KEY,
              articles: articles
            };
            
            fs.writeFileSync('news.json', JSON.stringify(data, null, 2));
            console.log(`ZAPISANO ${articles.length} wiadomości z Groq enhancement`);
            
          } catch (error) {
            console.error('BŁĄD WIADOMOŚCI:', error);
            
            const fallbackData = {
              lastUpdate: new Date().toISOString(),
              enhancedWithGroq: false,
              error: error.message,
              articles: []
            };
            
            fs.writeFileSync('news.json', JSON.stringify(fallbackData, null, 2));
          }
        }
        
        async function updateSecurity() {
          try {
            console.log('\\n=== AKTUALIZACJA BEZPIECZEŃSTWA ===');
            const xml = await fetchRSS('defence24.pl', '/_rssd');
            const articles = parseRSS(xml, 15);
            
            const data = {
              lastUpdate: new Date().toISOString(),
              enhancedWithGroq: false,
              source: 'Defence24.pl',
              articles: articles
            };
            
            fs.writeFileSync('security.json', JSON.stringify(data, null, 2));
            console.log(`ZAPISANO ${articles.length} artykułów o bezpieczeństwie`);
            
          } catch (error) {
            console.error('BŁĄD BEZPIECZEŃSTWA:', error);
            
            const fallbackData = {
              lastUpdate: new Date().toISOString(),
              enhancedWithGroq: false,
              error: error.message,
              source: 'Defence24.pl',
              articles: []
            };
            
            fs.writeFileSync('security.json', JSON.stringify(fallbackData, null, 2));
          }
        }
        
        async function updateScience() {
          try {
            console.log('\\n=== AKTUALIZACJA NAUKI ===');
            const xml = await fetchRSS('dzienniknaukowy.pl', '/feed');
            const articles = parseRSS(xml, 15);
            
            const data = {
              lastUpdate: new Date().toISOString(),
              enhancedWithGroq: false,
              source: 'DziennikNaukowy.pl',
              articles: articles
            };
            
            fs.writeFileSync('science.json', JSON.stringify(data, null, 2));
            console.log(`ZAPISANO ${articles.length} artykułów naukowych`);
            
          } catch (error) {
            console.error('BŁĄD NAUKI:', error);
            
            const fallbackData = {
              lastUpdate: new Date().toISOString(),
              enhancedWithGroq: false,
              error: error.message,
              source: 'DziennikNaukowy.pl',
              articles: []
            };
            
            fs.writeFileSync('science.json', JSON.stringify(fallbackData, null, 2));
          }
        }
        
        // === MAIN EXECUTION ===
        
        async function main() {
          console.log('🚀 START: Aktualizacja wszystkich RSS feeds');
          console.log('Czas:', new Date().toISOString());
          console.log('GROQ_API_KEY:', GROQ_API_KEY ? 'DOSTĘPNY' : 'BRAK');
          
          // Uruchom wszystkie aktualizacje równolegle (szybciej)
          await Promise.all([
            updateNews(),
            updateSecurity(), 
            updateScience()
          ]);
          
          console.log('\\n✅ ZAKOŃCZONO: Wszystkie RSS feeds zaktualizowane');
        }
        
        main().catch(error => {
          console.error('KRYTYCZNY BŁĄD:', error);
          process.exit(1);
        });
        EOF
        
        node update-all-feeds.js
        
    - name: Commit and push changes
      run: |
        git config --local user.email "action@github.com"
        git config --local user.name "GitHub Action"
        git add *.json
        if git diff --staged --quiet; then
          echo "Brak zmian w plikach JSON"
        else
          git commit -m "Aktualizacja wszystkich RSS feeds $(date)"
          git push
        fi
