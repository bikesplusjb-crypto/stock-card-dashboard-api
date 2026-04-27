const express = require("express");
const cors = require("cors");
const Parser = require("rss-parser");

const app = express();
const parser = new Parser();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Dashboard API is running",
    routes: ["/api/dashboard"]
  });
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
  new Map(allStockNews.map(item => [item.title, item])).values()
);

const stockNews = uniqueStockNews.slice(0, 15).map(item => ({
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
  ]
});
  } catch (error) {
    console.error("Dashboard error:", error);

    res.status(500).json({
      error: true,
      message: "Dashboard data could not load"
    });
  }
});
app.get("/api/ebay/search", async (req, res) => {
  try {
    const query = req.query.q || "baseball rookie card";
    const limit = req.query.limit || 6;

    const token = await getEbayToken();

    const ebayUrl =
      `https://api.ebay.com/buy/browse/v1/item_summary/search` +
      `?q=${encodeURIComponent(query)}` +
      `&limit=${limit}` +
      `&filter=buyingOptions:{FIXED_PRICE}`;

    const response = await fetch(ebayUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US"
      }
    });

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
      itemUrl: makeEbayAffiliateUrl(item.itemWebUrl, "scanner"),
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
    res.status(500).json({
      error: true,
      message: "Could not load eBay listings"
    });
  }
});
app.get("/api/ebay/search", async (req, res) => {
  try {
    const query = req.query.q || "baseball cards";
    const limit = req.query.limit || 10;

    const token = await getEbayToken();

    const ebayUrl =
      `https://api.ebay.com/buy/browse/v1/item_summary/search` +
      `?q=${encodeURIComponent(query)}` +
      `&limit=${limit}` +
      `&filter=buyingOptions:{FIXED_PRICE}`;

    const response = await fetch(ebayUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US"
      }
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("eBay search error:", data);

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
      condition: item.condition || null,
      seller: item.seller?.username || null,
      itemUrl: makeEbayAffiliateUrl(item.itemWebUrl, "scanner")
    }));

    res.json({
      updatedAt: new Date().toISOString(),
      query,
      count: items.length,
      items
    });
  } catch (error) {
    console.error("eBay route error:", error);

    res.status(500).json({
      error: true,
      message: "Could not load eBay listings",
      details: error.message
    });
  }
});
app.listen(PORT, () => {
  console.log(`Dashboard API running on port ${PORT}`);
});
