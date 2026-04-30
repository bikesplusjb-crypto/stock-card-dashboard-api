const express = require("express");
const cors = require("cors");
const Parser = require("rss-parser");

const app = express();
const parser = new Parser();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || process.env.ALPHA_KEY;
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
    console.error("EBAY TOKEN ERROR RAW:", text);
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

        let status = "flat";
        if (data.dp > 2) status = "hot";
        else if (data.dp < -2) status = "cold";

        return {
          symbol,
          price: data.c || null,
          change: data.d || null,
          percentChange: data.dp || null,
          status
        };
      })
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

    const stockNews = uniqueStockNews.slice(0, 8).map((item) => ({
      title: item.title,
      link: item.link,
      published: item.pubDate
    }));

    const cardFeed = await parser.parseURL(
      "https://news.google.com/rss/search?q=baseball+cards+rookie+cards+sports+cards"
    );

    res.json({
      updatedAt: new Date().toISOString(),

      stocks,

      topMovers: [...stocks]
        .filter((s) => s.percentChange !== null)
        .sort((a, b) => b.percentChange - a.percentChange)
        .slice(0, 3),

      stockNews,

      cardNews: cardFeed.items.slice(0, 6).map((item) => ({
        title: item.title,
        link: item.link,
        published: item.pubDate
      })),

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
          trend: "hot",
          ebayUrl: "https://www.ebay.com/sch/i.html?_nkw=charizard+base+set+psa"
        },
        {
          name: "Pikachu Illustrator Card",
          trend: "hot",
          ebayUrl: "https://www.ebay.com/sch/i.html?_nkw=pikachu+illustrator+card"
        },
        {
          name: "Umbreon VMAX Alt Art",
          trend: "hot",
          ebayUrl: "https://www.ebay.com/sch/i.html?_nkw=umbreon+vmax+alt+art"
        },
        {
          name: "Lugia Neo Genesis",
          trend: "flat",
          ebayUrl: "https://www.ebay.com/sch/i.html?_nkw=lugia+neo+genesis+psa"
        },
        {
          name: "Mewtwo First Edition",
          trend: "flat",
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
    background: linear-gradient(135deg, #020617, #0f172a);
    color: white;
    padding: 20px;
  }

  h1 {
    font-size: 30px;
    margin-bottom: 5px;
  }

  h2 {
    margin-top: 30px;
    font-size: 22px;
  }

  .updated {
    color: #94a3b8;
    font-size: 13px;
    margin-bottom: 20px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
  }

  .card {
    background: rgba(30, 41, 59, 0.85);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 18px;
    padding: 16px;
    box-shadow: 0 12px 30px rgba(0,0,0,.3);
  }

  .symbol {
    font-size: 22px;
    font-weight: bold;
  }

  .price {
    margin-top: 8px;
    font-size: 18px;
  }

  .hot {
    color: #22c55e;
    font-weight: bold;
  }

  .cold {
    color: #ef4444;
    font-weight: bold;
  }

  .flat {
    color: #cbd5e1;
    font-weight: bold;
  }

  .tag {
    display: inline-block;
    background: rgba(59,130,246,.2);
    color: #bfdbfe;
    border-radius: 999px;
    padding: 5px 9px;
    font-size: 12px;
    margin-bottom: 10px;
  }

  a {
    color: #67e8f9;
    text-decoration: none;
    font-weight: 700;
  }

  a:hover {
    text-decoration: underline;
  }
</style>
</head>

<body>
  <h1>📊 Market Dashboard</h1>
  <div id="updated" class="updated">Loading...</div>
  <div id="content"></div>

<script>
fetch("/api/dashboard")
  .then(res => res.json())
  .then(data => {
    document.getElementById("updated").innerHTML =
      "Last updated: " + new Date(data.updatedAt).toLocaleString();

    let html = "";

    html += "<h2>🔥 Top Movers</h2><div class='grid'>";
    data.topMovers.forEach(s => {
      const moveClass = Number(s.percentChange) >= 0 ? "hot" : "cold";
      html += \`
        <div class="card">
          <div class="symbol">\${s.symbol}</div>
          <div class="\${moveClass}">\${Number(s.percentChange).toFixed(2)}%</div>
        </div>
      \`;
    });
    html += "</div>";

    html += "<h2>📈 Stocks</h2><div class='grid'>";
    data.stocks.forEach(s => {
      const moveClass = s.status === "hot" ? "hot" : s.status === "cold" ? "cold" : "flat";
      const arrow = s.status === "hot" ? "▲ HOT" : s.status === "cold" ? "▼ COLD" : "● FLAT";

      html += \`
        <div class="card">
          <div class="symbol">\${s.symbol}</div>
          <div class="price">$\${s.price}</div>
          <div class="\${moveClass}">\${arrow} \${Number(s.percentChange).toFixed(2)}%</div>
        </div>
      \`;
    });
    html += "</div>";

    html += "<h2>📰 Stock News</h2>";
    data.stockNews.slice(0, 5).forEach(n => {
      html += \`
        <div class="card">
          <span class="tag">Market News</span><br>
          <a href="\${n.link}" target="_blank">\${n.title}</a>
        </div>
      \`;
    });

    html += "<h2>⚾ Trending Sports Cards</h2><div class='grid'>";
    data.trendingCards.forEach(c => {
      html += \`
        <div class="card">
          <span class="tag">Baseball Card</span><br>
          <a href="\${c.ebayUrl}" target="_blank">\${c.name}</a>
        </div>
      \`;
    });
    html += "</div>";

    html += "<h2>🐉 Trending Pokémon Cards</h2><div class='grid'>";
    data.pokemon.forEach(p => {
      const trendClass = p.trend === "hot" ? "hot" : p.trend === "cold" ? "cold" : "flat";
      html += \`
        <div class="card">
          <span class="tag">Pokémon</span><br>
          <a href="\${p.ebayUrl}" target="_blank">\${p.name}</a>
          <div class="\${trendClass}">\${p.trend.toUpperCase()}</div>
        </div>
      \`;
    });
    html += "</div>";

    document.getElementById("content").innerHTML = html;
  })
  .catch(error => {
    document.getElementById("content").innerHTML =
      "<div class='card'>Dashboard could not load. Refresh the page.</div>";
    console.error(error);
  });
</script>
</body>
</html>
  `);
});
app.get("/pokemon", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Pokémon Card Market</title>

<style>
  body {
    margin: 0;
    font-family: Arial, sans-serif;
    background: #050816;
    color: white;
  }

  .hero {
    background: linear-gradient(135deg, #1d4ed8, #4f46e5, #7c3aed);
    padding: 45px 25px;
    text-align: center;
  }

  .hero small {
    color: #fde68a;
    font-weight: bold;
    letter-spacing: 2px;
  }

  .hero h1 {
    font-size: 46px;
    margin: 12px 0;
  }

  .hero p {
    font-size: 18px;
    color: #dbeafe;
    max-width: 850px;
    margin: auto;
  }

  .wrap {
    padding: 25px;
  }

  .tabs {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 25px;
  }

  .tab {
    background: rgba(255,255,255,.1);
    border: 1px solid rgba(255,255,255,.2);
    color: white;
    padding: 12px 18px;
    border-radius: 999px;
    font-weight: bold;
  }

  .tab.active {
    background: #facc15;
    color: #111827;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 18px;
  }

  .card {
    background: rgba(30,41,59,.9);
    border: 1px solid rgba(255,255,255,.15);
    border-radius: 22px;
    padding: 22px;
    box-shadow: 0 15px 40px rgba(0,0,0,.35);
  }

  .card h2 {
    margin: 0 0 5px;
    font-size: 25px;
  }

  .set {
    color: #cbd5e1;
    margin-bottom: 18px;
  }

  .price {
    font-size: 38px;
    font-weight: 900;
    color: #bbf7d0;
    margin: 10px 0;
  }

  .change {
    font-size: 18px;
    font-weight: bold;
    color: #86efac;
  }

  .signal {
    display: inline-block;
    margin-top: 12px;
    padding: 7px 12px;
    border-radius: 999px;
    font-weight: bold;
    font-size: 13px;
  }

  .buy {
    background: rgba(34,197,94,.2);
    color: #86efac;
  }

  .hold {
    background: rgba(250,204,21,.2);
    color: #fde68a;
  }

  .watch {
    background: rgba(96,165,250,.2);
    color: #bfdbfe;
  }

  .reason {
    margin-top: 15px;
    background: rgba(255,255,255,.08);
    padding: 14px;
    border-radius: 14px;
    color: #e5e7eb;
    line-height: 1.4;
  }

  .heat {
    margin-top: 15px;
  }

  .bar {
    height: 12px;
    background: rgba(255,255,255,.15);
    border-radius: 999px;
    overflow: hidden;
    margin-top: 8px;
  }

  .fill {
    height: 100%;
    background: linear-gradient(90deg, #22c55e, #facc15, #ef4444);
  }

  .btns {
    display: flex;
    gap: 10px;
    margin-top: 18px;
    flex-wrap: wrap;
  }

  a.btn {
    display: inline-block;
    background: #22c55e;
    color: #052e16;
    text-decoration: none;
    padding: 11px 14px;
    border-radius: 12px;
    font-weight: 900;
  }

  a.btn.secondary {
    background: #38bdf8;
    color: #082f49;
  }

  .section-title {
    margin-top: 35px;
    font-size: 28px;
  }

  .search-box {
    background: rgba(30,41,59,.9);
    padding: 22px;
    border-radius: 20px;
    margin-bottom: 25px;
  }

  input {
    padding: 14px;
    width: min(420px, 90%);
    border-radius: 12px;
    border: none;
    font-size: 16px;
  }

  button {
    padding: 14px 18px;
    border-radius: 12px;
    border: none;
    background: #22c55e;
    font-weight: 900;
    cursor: pointer;
    margin-left: 8px;
  }

  .premium {
    margin-top: 30px;
    background: linear-gradient(135deg, #111827, #312e81);
    border: 1px solid rgba(255,255,255,.2);
    border-radius: 24px;
    padding: 24px;
  }

  @media (max-width: 600px) {
    .hero h1 {
      font-size: 34px;
    }

    button {
      margin-left: 0;
      margin-top: 10px;
    }
  }
</style>
</head>

<body>

<div class="hero">
  <small>POKÉMON MARKET TRACKER</small>
  <h1>Pokémon Collectible Dashboard</h1>
  <p>Track Pokémon card movers, heat scores, buy/hold/watch signals, sealed product trends, portfolio ideas, and live eBay searches.</p>
</div>

<div class="wrap">

  <div class="tabs">
    <div class="tab active">Movers</div>
    <div class="tab">Heat Map</div>
    <div class="tab">Signals</div>
    <div class="tab">Sealed</div>
    <div class="tab">Scanner</div>
    <div class="tab">Portfolio</div>
  </div>

  <div class="search-box">
    <h2>🔎 Pokémon Card Search</h2>
    <input id="search" placeholder="Example: Charizard PSA 10" />
    <button onclick="searchPokemon()">Search eBay</button>
  </div>

  <h2 class="section-title">🔥 Top Pokémon Movers</h2>

  <div class="grid" id="pokemonCards"></div>

  <h2 class="section-title">📦 Sealed Product Watchlist</h2>

  <div class="grid">
    <div class="card">
      <h2>Pokémon 151 Booster Bundle</h2>
      <div class="set">Sealed Product</div>
      <div class="price">WATCH</div>
      <div class="change">Collector demand remains strong</div>
      <span class="signal watch">WATCH</span>
      <div class="reason">Good long-term sealed product candidate if prices cool down.</div>
      <div class="btns">
        <a class="btn" target="_blank" href="https://www.ebay.com/sch/i.html?_nkw=pokemon+151+booster+bundle">View Listings</a>
      </div>
    </div>

    <div class="card">
      <h2>Evolving Skies Booster Box</h2>
      <div class="set">Sealed Product</div>
      <div class="price">HOLD</div>
      <div class="change">Umbreon demand supports sealed prices</div>
      <span class="signal hold">HOLD</span>
      <div class="reason">High-demand set with strong chase card support.</div>
      <div class="btns">
        <a class="btn" target="_blank" href="https://www.ebay.com/sch/i.html?_nkw=evolving+skies+booster+box">View Listings</a>
      </div>
    </div>
  </div>

  <div class="premium">
    <h2>💎 Premium Pokémon Alerts Coming Soon</h2>
    <p>Unlock price alerts, top movers, scanner tools, sealed product watchlists, and buy/hold/sell signals.</p>
    <ul>
      <li>🔥 Heat Score alerts</li>
      <li>📈 30-day trend tracking</li>
      <li>🧾 Portfolio watchlist</li>
      <li>🛒 eBay deal finder</li>
    </ul>
  </div>

</div>

<script>
const cards = [
  {
    name: "Charizard Holo PSA 10",
    set: "1999 Base Set",
    price: "$12,500",
    change: "+14.8%",
    heat: 96,
    signal: "BUY",
    signalClass: "buy",
    reason: "Vintage demand, iconic character, and strong PSA 10 collector interest.",
    ebay: "charizard+holo+psa+10+base+set"
  },
  {
    name: "Pikachu Van Gogh",
    set: "Promo Card",
    price: "$185",
    change: "+9.2%",
    heat: 88,
    signal: "HOLD",
    signalClass: "hold",
    reason: "Limited promo demand and strong collector attention.",
    ebay: "pikachu+van+gogh+pokemon+card"
  },
  {
    name: "Umbreon VMAX Alt Art",
    set: "Evolving Skies",
    price: "$850",
    change: "+6.7%",
    heat: 91,
    signal: "BUY",
    signalClass: "buy",
    reason: "Modern chase card with high collector demand.",
    ebay: "umbreon+vmax+alt+art"
  },
  {
    name: "Lugia Neo Genesis",
    set: "Neo Genesis",
    price: "$475",
    change: "+4.1%",
    heat: 82,
    signal: "HOLD",
    signalClass: "hold",
    reason: "Vintage legendary Pokémon with steady demand.",
    ebay: "lugia+neo+genesis+pokemon+card"
  },
  {
    name: "Mewtwo First Edition",
    set: "WOTC Era",
    price: "$325",
    change: "+2.8%",
    heat: 76,
    signal: "WATCH",
    signalClass: "watch",
    reason: "Recognizable character with long-term nostalgia value.",
    ebay: "mewtwo+first+edition+pokemon+card"
  },
  {
    name: "Rayquaza VMAX Alt Art",
    set: "Evolving Skies",
    price: "$390",
    change: "+5.6%",
    heat: 84,
    signal: "HOLD",
    signalClass: "hold",
    reason: "Strong artwork demand and modern collector interest.",
    ebay: "rayquaza+vmax+alt+art"
  }
];

function loadCards() {
  const container = document.getElementById("pokemonCards");

  cards.forEach(function(card) {
    const ebayUrl = "https://www.ebay.com/sch/i.html?_nkw=" + card.ebay;

    container.innerHTML +=
      '<div class="card">' +
        '<h2>' + card.name + '</h2>' +
        '<div class="set">' + card.set + '</div>' +
        '<div class="price">' + card.price + '</div>' +
        '<div class="change">30-Day Change: ' + card.change + '</div>' +
        '<span class="signal ' + card.signalClass + '">' + card.signal + '</span>' +
        '<div class="heat"><b>Heat Score: ' + card.heat + '/100</b><div class="bar"><div class="fill" style="width:' + card.heat + '%"></div></div></div>' +
        '<div class="reason"><b>Why it’s moving:</b><br>' + card.reason + '</div>' +
        '<div class="btns">' +
          '<a class="btn" target="_blank" href="' + ebayUrl + '">View Live Listings</a>' +
          '<a class="btn secondary" target="_blank" href="' + ebayUrl + '&LH_Sold=1&LH_Complete=1">Sold Prices</a>' +
        '</div>' +
      '</div>';
  });
}

function searchPokemon() {
  const q = document.getElementById("search").value.trim();

  if (!q) {
    alert("Type a Pokémon card name first.");
    return;
  }

  window.open("https://www.ebay.com/sch/i.html?_nkw=" + encodeURIComponent(q + " pokemon card"), "_blank");
}

loadCards();
</script>

</body>
</html>
  `);
});
app.listen(PORT, () => {
 console.log(`Dashboard API running on port ${PORT}`);
});
