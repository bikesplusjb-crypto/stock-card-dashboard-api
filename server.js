const express = require("express");
const cors = require("cors");
const Parser = require("rss-parser");

const app = express();
const parser = new Parser();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;

let ebayToken = null;
let ebayTokenExpiresAt = 0;

async function getEbayToken() {
  if (ebayToken && Date.now() < ebayTokenExpiresAt) {
    return ebayToken;
  }

  const credentials = Buffer.from(
    `${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`
    },
    body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope"
  });

  const text = await response.text();

  if (!response.ok) {
    console.error("EBAY TOKEN ERROR:", text);
    throw new Error("eBay token failed");
  }

  const data = JSON.parse(text);

  ebayToken = data.access_token;
  ebayTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;

  return ebayToken;
}

app.get("/", (req, res) => {
  res.send("Dashboard API is running");
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const symbols = ["AAPL", "NVDA", "TSLA", "AMZN", "PLTR"];

    const stocks = await Promise.all(
      symbols.map(async (symbol) => {
        const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        return {
          symbol,
          price: data.c || null,
          change: data.d || null,
          percentChange: data.dp || null
        };
      })
    );

    const cardFeed = await parser.parseURL(
      "https://news.google.com/rss/search?q=baseball+cards+rookie+cards+sports+cards"
    );

    const stockFeeds = [
      "https://news.google.com/rss/search?q=stock+market",
      "https://news.google.com/rss/search?q=nasdaq+stocks",
      "https://news.google.com/rss/search?q=earnings+stocks",
      "https://news.google.com/rss/search?q=tech+stocks",
      "https://news.google.com/rss/search?q=stock+market+today"
    ];

    let allStockNews = [];

    for (const feed of stockFeeds) {
      const parsed = await parser.parseURL(feed);
      allStockNews = allStockNews.concat(parsed.items);
    }

    const uniqueStockNews = Array.from(
      new Map(allStockNews.map((item) => [item.title, item])).values()
    );

    const stockNews = uniqueStockNews.slice(0, 10).map((item) => ({
      title: item.title,
      link: item.link,
      published: item.pubDate
    }));

    res.json({
      updatedAt: new Date().toISOString(),

      stocks,

      cardNews: cardFeed.items.slice(0, 6).map((item) => ({
        title: item.title,
        link: item.link,
        published: item.pubDate
      })),

      stockNews,

      trendingCards: [
        {
          name: "Paul Skenes rookie card",
          ebayUrl: "https://www.ebay.com/sch/i.html?_nkw=paul+skenes+rookie+card"
        },
        {
          name: "Roman Anthony rookie card",
          ebayUrl: "https://www.ebay.com/sch/i.html?_nkw=roman+anthony+rookie+card"
        },
        {
          name: "Jac Caglianone rookie card",
          ebayUrl: "https://www.ebay.com/sch/i.html?_nkw=jac+caglianone+rookie+card"
        }
      ],

      pokemon: [
        {
          name: "Charizard Base Set PSA",
          ebayUrl: "https://www.ebay.com/sch/i.html?_nkw=charizard+base+set+psa"
        },
        {
          name: "Pikachu Illustrator Card",
          ebayUrl: "https://www.ebay.com/sch/i.html?_nkw=pikachu+illustrator+card"
        },
        {
          name: "Umbreon VMAX Alt Art",
          ebayUrl: "https://www.ebay.com/sch/i.html?_nkw=umbreon+vmax+alt+art"
        },
        {
          name: "Lugia Neo Genesis",
          ebayUrl: "https://www.ebay.com/sch/i.html?_nkw=lugia+neo+genesis+psa"
        },
        {
          name: "Mewtwo First Edition",
          ebayUrl: "https://www.ebay.com/sch/i.html?_nkw=mewtwo+first+edition+pokemon+card"
        }
      ]
    });
  } catch (error) {
    console.error("Dashboard error:", error);

    res.status(500).json({
      error: true,
      message: "Dashboard data could not load",
      details: error.message
    });
  }
});

app.get("/api/ebay/search", async (req, res) => {
  try {
    const query = req.query.q || "baseball cards";

    const token = await getEbayToken();

    const response = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
          "Content-Type": "application/json"
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        error: true,
        message: "eBay search failed",
        details: data
      });
    }

    const items = (data.itemSummaries || []).map((item) => ({
      title: item.title,
      price: item.price?.value || null,
      currency: item.price?.currency || "USD",
      image: item.image?.imageUrl || null,
      itemUrl: item.itemWebUrl,
      condition: item.condition || null,
      seller: item.seller?.username || null
    }));

    res.json({
      updatedAt: new Date().toISOString(),
      query,
      count: items.length,
      items
    });
  } catch (error) {
    console.error("EBAY ERROR:", error);

    res.status(500).json({
      error: true,
      message: "Could not load eBay listings",
      details: error.message
    });
  }
});

app.get("/dashboard", async (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #020617;
      color: white;
      padding: 18px;
    }

    h2 {
      margin-top: 0;
      font-size: 28px;
    }

    h3 {
      margin-top: 28px;
      font-size: 20px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
    }

    .card {
      background: #0f172a;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 16px;
      padding: 16px;
      box-shadow: 0 10px 25px rgba(0,0,0,.25);
    }

    .symbol {
      font-size: 20px;
      font-weight: bold;
    }

    .price {
      margin-top: 8px;
      font-size: 18px;
    }

    .up {
      color: #22c55e;
    }

    .down {
      color: #ef4444;
    }

    a {
      color: #60a5fa;
      text-decoration: none;
      font-weight: 600;
    }

    a:hover {
      text-decoration: underline;
    }

    .tag {
      display: inline-block;
      background: #1e293b;
      color: #cbd5e1;
      padding: 5px 9px;
      border-radius: 999px;
      font-size: 12px;
      margin-bottom: 10px;
    }

    .updated {
      color: #94a3b8;
      font-size: 13px;
      margin-bottom: 20px;
    }
  </style>
</head>

<body>
  <h2>📊 Market Dashboard</h2>
  <div id="updated" class="updated">Loading latest data...</div>
  <div id="content"></div>

  <script>
    fetch("/api/dashboard")
      .then(res => res.json())
      .then(data => {
        document.getElementById("updated").innerHTML =
          "Last updated: " + new Date(data.updatedAt).toLocaleString();

        let html = "";

        html += "<h3>📈 Stocks</h3>";
        html += "<div class='grid'>";

        data.stocks.forEach(s => {
          const moveClass = Number(s.percentChange) >= 0 ? "up" : "down";
          const arrow = Number(s.percentChange) >= 0 ? "▲" : "▼";

          html += \`
            <div class="card">
              <div class="symbol">\${s.symbol}</div>
              <div class="price">$\${s.price}</div>
              <div class="\${moveClass}">
                \${arrow} \${s.percentChange}%
              </div>
            </div>
          \`;
        });

        html += "</div>";

        html += "<h3>📰 Stock News</h3>";
        data.stockNews.slice(0, 5).forEach(n => {
          html += \`
            <div class="card">
              <span class="tag">Market News</span><br>
              <a href="\${n.link}" target="_blank">\${n.title}</a>
            </div>
          \`;
        });

        html += "<h3>⚾ Trending Sports Cards</h3>";
        html += "<div class='grid'>";
        data.trendingCards.forEach(c => {
          html += \`
            <div class="card">
              <span class="tag">Baseball Card</span><br>
              <a href="\${c.ebayUrl}" target="_blank">\${c.name}</a>
            </div>
          \`;
        });
        html += "</div>";

        html += "<h3>🐉 Trending Pokémon Cards</h3>";
        html += "<div class='grid'>";
        data.pokemon.forEach(p => {
          html += \`
            <div class="card">
              <span class="tag">Pokémon</span><br>
              <a href="\${p.ebayUrl}" target="_blank">\${p.name}</a>
            </div>
          \`;
        });
        html += "</div>";

        document.getElementById("content").innerHTML = html;
      })
      .catch(error => {
        document.getElementById("content").innerHTML =
          "<div class='card'>Dashboard could not load. Try refreshing.</div>";
        console.error(error);
      });
  </script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log(`Dashboard API running on port ${PORT}`);
});
