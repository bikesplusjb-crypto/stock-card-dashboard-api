const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fetch = require("node-fetch");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* Health check */
app.get("/", (req, res) => {
  res.json({ status: "Card scanner backend running" });
});

/* Card price search */
app.get("/card/:name", async (req, res) => {
  try {
    const name = req.params.name;

    const ebayUrl =
      "https://www.ebay.com/sch/i.html?_nkw=" +
      encodeURIComponent(name) +
      "&LH_Sold=1&LH_Complete=1";

    const mockPrice = Math.floor(25 + Math.random() * 275);

    res.json({
      search: name,
      avgPrice: mockPrice,
      lowPrice: Math.max(5, mockPrice - 35),
      highPrice: mockPrice + 80,
      listings: Math.floor(15 + Math.random() * 90),
      ebayUrl
    });
  } catch (err) {
    res.status(500).json({ error: "Card search failed" });
  }
});

/* Image scan endpoint */
app.post("/scan-card", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    /*
      This is the safe fallback version.
      It confirms upload works and returns a scanner result.
      Later you can connect OpenAI Vision or another card recognition API here.
    */

    const fallbackName = "Unknown Sports Card";
    const estimatedValue = Math.floor(20 + Math.random() * 180);

    res.json({
      success: true,
      name: fallbackName,
      avgPrice: estimatedValue,
      lowPrice: Math.max(5, estimatedValue - 25),
      highPrice: estimatedValue + 60,
      listings: Math.floor(10 + Math.random() * 60),
      ebayUrl:
        "https://www.ebay.com/sch/i.html?_nkw=" +
        encodeURIComponent(fallbackName) +
        "&LH_Sold=1&LH_Complete=1",
      note: "Image received. Use manual name entry for best pricing."
    });
  } catch (err) {
    res.status(500).json({ error: "Scanner failed" });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
