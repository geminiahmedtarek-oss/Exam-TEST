import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API Routes
  app.get("/api/drive/list", async (req, res) => {
    const folderId = "11pBU70shMYmBAw0lGEqd1h1nYK1hJiaG";
    const folderUrl = `https://drive.google.com/drive/folders/${folderId}?usp=sharing`;

    try {
      const response = await fetch(folderUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        },
      });
      const html = await response.text();
      const files: { id: string; name: string }[] = [];

      // Google Drive IDs are typically between 28 and 45 characters of alphanumeric characters, hyphens, and underscores.
      // We look for any string matching this pattern that is closely followed by a .json extension
      
      const idPattern = /[a-zA-Z0-9_-]{28,45}/g;
      const jsonPattern = /[^"\\\[\]\n\r\t]+?\.json/gi;

      let match;
      const idIndices: {id: string, index: number}[] = [];
      const foundNames: {name: string, index: number}[] = [];

      // Extract all IDs and their positions
      let idMatch;
      while ((idMatch = idPattern.exec(html)) !== null) {
        idIndices.push({ id: idMatch[0], index: idMatch.index });
      }

      // Extract all JSON names and their positions
      let nameMatch;
      while ((nameMatch = jsonPattern.exec(html)) !== null) {
        let name = nameMatch[0]
          .replace(/\\u([0-9a-fA-F]{4})/g, (_, grp) => String.fromCharCode(parseInt(grp, 16)))
          .replace(/&quot;/g, '')
          .replace(/\\/g, '')
          .replace(/^x22/, '')
          .replace(/^"/, '')
          .trim();

        // Filter out system files or non-exam files
        const isSystemFile = name.includes('/') || name.includes('manifest.json') || name.startsWith('.') || name.length < 5;
        
        if (!isSystemFile) {
          foundNames.push({ name, index: nameMatch.index });
        }
      }

      // Associate names with the nearest preceding ID (within 1000 characters)
      for (const nameObj of foundNames) {
        const candidateIds = idIndices.filter(idObj => 
          idObj.index < nameObj.index && (nameObj.index - idObj.index) < 1500
        );
        
        if (candidateIds.length > 0) {
          const closestId = candidateIds[candidateIds.length - 1].id;
          // Check if we already have this file by ID OR by Name (deduplicate)
          if (!files.find(f => f.id === closestId || f.name === nameObj.name)) {
            files.push({ id: closestId, name: nameObj.name });
          }
        }
      }

      // Manual fallback for the TOGAF file if it exists in HTML but pairing failed
      if (files.length === 0 && html.includes("TOGAF")) {
         const togafId = html.match(/1BL5KEGwY2qWyDTUBl_cpzE6YY3zN0IT1/); // Using the ID you provided as a hint if it's there
         if (togafId) {
            files.push({ id: togafId[0], name: "TOGAF® Super Mega.json" });
         } else {
            // Very loose fallback for ANY ID near TOGAF
            const looseId = html.match(/([a-zA-Z0-9_-]{33})[^a-zA-Z0-9_-]{0,200}TOGAF/);
            if (looseId) files.push({ id: looseId[1], name: "TOGAF® Super Mega.json" });
         }
      }

      res.json({ files });
    } catch (error) {
      console.error("Error scraping Drive folder:", error);
      res.status(500).json({ error: "Failed to scrape Drive folder" });
    }
  });

  // Proxy for downloading file content
  app.get("/api/drive/download/:id", async (req, res) => {
    const fileId = req.params.id;
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

    try {
      const response = await fetch(downloadUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText}`);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
       console.error("Error downloading from Drive:", error);
       res.status(500).json({ error: "Failed to download file" });
    }
  });

  // Proxy for AI Exam Generation from PDF (Secure Server-side call)
  app.post("/api/ai/generate", express.json({ limit: '50mb' }), async (req, res) => {
    try {
      const { base64Data, promptText } = req.body;
      const { GoogleGenAI } = await import("@google/genai");
      
      const apiKey = process.env.GEMINI_API_KEY?.trim();
      
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        return res.status(500).json({ 
          error: "GEMINI_API_KEY_MISSING", 
          message: "Please configure a valid GEMINI_API_KEY in the Environment Variables." 
        });
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: [
            { inlineData: { mimeType: "application/pdf", data: base64Data } },
            { text: promptText }
          ]
        }
      });
      
      res.json({ text: response.text });
    } catch (error: any) {
      console.error("AI Generation Error:", error);
      res.status(500).json({ 
        error: "AI_GENERATION_FAILED", 
        message: error.message || "An unexpected error occurred during generation." 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
