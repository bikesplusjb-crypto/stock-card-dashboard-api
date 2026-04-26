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

    const stockFeed = await parser.parseURL(
      "https://news.google.com/rss/search?q=stock+market+top+movers"
    );

    res.json({
      updatedAt: new Date().toISOString(),
      stocks,
      cardNews: cardFeed.items.slice(0, 6).map((item) => ({
        title: item.title,
        link: item.link,
        published: item.pubDate
      })),
      stockNews: stockFeed.items.slice(0, 6).map((item) => ({
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

app.listen(PORT, () => {
  console.log(`Dashboard API running on port ${PORT}`);
});
