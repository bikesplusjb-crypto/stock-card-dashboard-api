const express = require("express");
const cors = require("cors");
const multer = require("multer");
const OpenAI = require("openai");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

app.get("/", (req, res) => {
  res.json({
    status: "AI Card Scanner Backend Running",
    openaiKeyLoaded: !!OPENAI_API_KEY
  });
});

app.get("/test-openai", async (req, res) => {
  try {
    const test = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say scanner ready" }]
    });

    res.json({
      success: true,
      message: test.choices[0].message.content
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "OpenAI test failed",
      details: err.message
    });
  }
});

app.post("/scan-card", upload.single("image"), async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "OPENAI_API_KEY is missing in Render"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No image uploaded"
      });
    }

    const base64Image = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype || "image/jpeg";

    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You identify trading cards from images. Return only JSON with cardName, player, year, brand, set, cardNumber, confidence, searchQuery."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Identify this sports card, Pokemon card, or collectible trading card. Create the best eBay sold-search query."
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

    const parsed = JSON.parse(ai.choices[0].message.content);

    const name =
      parsed.searchQuery ||
      parsed.cardName ||
      [parsed.year, parsed.brand, parsed.player, parsed.set, parsed.cardNumber]
        .filter(Boolean)
        .join(" ") ||
      "Unknown trading card";

    const ebayUrl =
      "https://www.ebay.com/sch/i.html?_nkw=" +
      encodeURIComponent(name) +
      "&LH_Sold=1&LH_Complete=1";

    res.json({
      success: true,
      name,
      cardName: parsed.cardName || name,
      player: parsed.player || "",
      year: parsed.year || "",
      brand: parsed.brand || "",
      set: parsed.set || "",
      cardNumber: parsed.cardNumber || "",
      confidence: parsed.confidence || "medium",
      ebayUrl
    });
  } catch (err) {
    console.error("SCAN ERROR:", err);

    res.status(500).json({
      success: false,
      error: "Scan failed",
      details: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`AI Card Scanner backend running on port ${PORT}`);
});
