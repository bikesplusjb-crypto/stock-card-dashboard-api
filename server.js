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

app.get("/", (req, res) => {
  res.json({
    status: "AI Card Scanner Backend Running"
  });
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
            "You identify sports cards, Pokemon cards, and trading cards from images. Return JSON only with: cardName, player, year, brand, set, cardNumber, confidence, searchQuery."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Identify this trading card and create the best eBay search query."
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

    const card = JSON.parse(aiResponse.choices[0].message.content);

    const query =
      card.searchQuery ||
      card.cardName ||
      [card.year, card.brand, card.player, card.set, card.cardNumber]
        .filter(Boolean)
        .join(" ") ||
      "Unknown sports card";

    const ebayUrl =
      "https://www.ebay.com/sch/i.html?_nkw=" +
      encodeURIComponent(query) +
      "&LH_Sold=1&LH_Complete=1";

    res.json({
      success: true,
      name: query,
      cardName: card.cardName || query,
      player: card.player || "",
      year: card.year || "",
      brand: card.brand || "",
      set: card.set || "",
      cardNumber: card.cardNumber || "",
      confidence: card.confidence || "medium",
      ebayUrl
    });
  } catch (err) {
    console.error("AI SCAN ERROR:", err.message);

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
