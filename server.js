const express = require("express");
const cors = require("cors");
const multer = require("multer");
const OpenAI = require("openai");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;

let ebayToken = null;
let ebayTokenExpiresAt = 0;

async function getEbayToken() {
  if (ebayToken && Date.now() < ebayTokenExpiresAt) return ebayToken;

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

async function getEbayPrices(query) {
  const ebayUrl =
    "https://www.ebay.com/sch/i.html?_nkw=" +
    encodeURIComponent(query) +
    "&LH_Sold=1&LH_Complete=1";

  let avgPrice = 0;
  let lowPrice = 0;
  let highPrice = 0;
  let listings = 0;

  try {
    const token = await getEbayToken();

    const response = await fetch(
      "https://api.ebay.com/buy/browse/v1/item_summary/search?q=" +
        encodeURIComponent(query) +
        "&limit=20",
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

    const prices = (data.itemSummaries || [])
      .map(item => Number(item.price?.value))
      .filter(price => !isNaN(price) && price > 0);

    listings = prices.length;

    if (prices.length) {
      lowPrice = Math.min(...prices);
      highPrice = Math.max(...prices);
      avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    }
  } catch (err) {
    console.error("eBay price lookup failed:", err.message);
  }

  return {
    avgPrice: Number(avgPrice).toFixed(2),
    lowPrice: Number(lowPrice).toFixed(2),
    highPrice: Number(highPrice).toFixed(2),
    listings,
    ebayUrl
  };
}

app.get("/", (req, res) => {
  res.json({
    status: "AI Card Scanner Backend Running",
    scanner: "OpenAI",
    cardsight: "removed"
  });
});

app.get("/card/:name", async (req, res) => {
  try {
    const name = req.params.name;
    const prices = await getEbayPrices(name);

    res.json({
      success: true,
      search: name,
      name,
      ...prices
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Card search failed",
      details: err.message
    });
  }
});

app.post("/scan-card", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No image uploaded"
      });
    }

    const base64Image = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype || "image/jpeg";

    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You identify sports cards, Pokemon cards, and trading cards from images. Return only JSON with these fields: cardName, player, year, brand, set, cardNumber, sport, confidence, searchQuery. If unsure, create the best searchable eBay query."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Identify this card. Make the searchQuery useful for eBay sold listing lookup."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 500
    });

    const identified = JSON.parse(aiResponse.choices[0].message.content);

    const query =
      identified.searchQuery ||
      identified.cardName ||
      [
        identified.year,
        identified.brand,
        identified.player,
        identified.set,
        identified.cardNumber
      ]
        .filter(Boolean)
        .join(" ") ||
      "Unknown sports card";

    const prices = await getEbayPrices(query);

    let signal = "WATCH";
    const avg = Number(prices.avgPrice || 0);

    if (avg >= 250) signal = "HOT";
    if (avg >= 500) signal = "PREMIUM";
    if (avg === 0) signal = "VERIFY";

    res.json({
      success: true,
      name: query,
      cardName: identified.cardName || query,
      player: identified.player || "",
      year: identified.year || "",
      brand: identified.brand || "",
      set: identified.set || "",
      cardNumber: identified.cardNumber || "",
      sport: identified.sport || "",
      confidence: identified.confidence || "medium",
      signal,
      search: query,
      ...prices
    });
  } catch (err) {
    console.error("AI SCAN ERROR:", err);

    res.status(500).json({
      success: false,
      error: "AI scan failed",
      details: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`AI Card Scanner backend running on port ${PORT}`);
});
