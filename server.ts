import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type, ThinkingLevel, GenerateContentResponse } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Please check the Settings > Secrets panel.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Main endpoint: Spatial OCR + Sinhala/Tamil to English Exam Paper Page Translation
  app.post("/api/translate-page", async (req, res) => {
    try {
      const {
        imageBase64,
        mimeType = "image/png",
        sourceLangHint = "auto",
        subjectContext = "Academic Examination Paper",
        nativeTextItems = [],
      } = req.body;

      if (!imageBase64) {
        res.status(400).json({ error: "Missing page image data (imageBase64)." });
        return;
      }

      const ai = getGenAIClient();

      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

      const nativeHintsPrompt =
        Array.isArray(nativeTextItems) && nativeTextItems.length > 0
          ? `\n\nNATIVE PDF TEXT LAYER HINTS (Normalized 0-1000 coordinates [ymin, xmin, ymax, xmax]):\n${JSON.stringify(
              nativeTextItems.slice(0, 120)
            )}\nUse these exact coordinate hints where applicable, merging fragments that belong to the same line or sentence while keeping separate questions, options, table cells, and right-aligned mark allocations in distinct bounding boxes.`
          : "";

      const langInstruction =
        sourceLangHint === "ta"
          ? "The source exam paper is primarily in Tamil (தமிழ்)."
          : sourceLangHint === "si"
          ? "The source exam paper is primarily in Sinhala (සිංහල)."
          : "Detect all Tamil (தமிழ்) and Sinhala (සිංහල) text on the exam paper page (as well as bilingual headers/labels).";

      const systemInstruction = `You are a specialist academic examination translator and spatial document layout analyzer for Sri Lankan and South Asian examination papers (GCE O/L, GCE A/L, university, and school term papers) in Sinhala (සිංහල) and Tamil (தமிழ்).

Your task is to analyze the provided exam paper page image and extract EVERY text block (headers, exam instructions, index number box labels, section titles, numbered questions, sub-questions, multiple-choice options (1)-(4) or (a)-(d), diagram/figure labels, table cells, mark allocations like (02 புள்ளிகள்) / (ලකුණු 02), and footers) with its EXACT 2D bounding box on the page and translate it into formal, publication-grade examination English.

CRITICAL SPATIAL & ALIGNMENT RULES:
1. Bounding boxes (box_2d) MUST be [ymin, xmin, ymax, xmax] normalized to a 0 to 1000 scale (where [0, 0] is top-left and [1000, 1000] is bottom-right of the image).
2. Each bounding box MUST tightly and accurately enclose the exact original Sinhala or Tamil text on the page so that when the original text inside box_2d is masked and replaced with your English translation, the page layout, alignment, tables, diagrams, and answer lines remain 100% intact.
3. Do NOT merge separate multiple-choice options or separate table cells into a single giant box. Keep each option (e.g. (1) ..., (2) ..., (3) ..., (4) ...), each table cell, each diagram callout label, and each right-aligned mark allocation in its own distinct bounding box at its exact position.
4. Preserve all question numbering, Roman numerals, parenthesized letters, mathematical equations, chemical formulas, units, and dotted answer lines (e.g. "....................") only if the dots are part of the text phrase—otherwise leave drawn horizontal answer lines unmasked below the text box.
5. Maintain formal academic examination register in English (e.g., "Answer all questions in this paper itself", "Select the most appropriate answer", "Show all relevant steps clearly").`;

      const userPrompt = `${langInstruction}
Subject / Domain Context: ${subjectContext}.
Extract every text block on this exam page with its exact [ymin, xmin, ymax, xmax] bounding box (0-1000 scale), alignment ('left', 'center', or 'right'), fontWeight ('normal' or 'bold'), structural role, original Sinhala/Tamil text, and formal English translation.${nativeHintsPrompt}`;

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            {
              text: userPrompt,
            },
          ],
        },
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedLanguage: {
                type: Type.STRING,
                description: "Detected source language(s), e.g. 'Tamil', 'Sinhala', or 'Tamil & Sinhala'.",
              },
              paperTitle: {
                type: Type.STRING,
                description: "Translated English title of the examination paper.",
              },
              blocks: {
                type: Type.ARRAY,
                description: "Every text region on the page in reading order with exact 0-1000 coordinates.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: {
                      type: Type.STRING,
                      description: "Unique identifier such as 'b-1', 'b-2', etc.",
                    },
                    originalText: {
                      type: Type.STRING,
                      description: "The exact original Sinhala or Tamil text in this bounding box.",
                    },
                    translatedText: {
                      type: Type.STRING,
                      description: "The formal examination English translation aligned to replace originalText.",
                    },
                    sourceLanguage: {
                      type: Type.STRING,
                      description: "'ta' for Tamil, 'si' for Sinhala, or 'en' if already English/math.",
                    },
                    box_2d: {
                      type: Type.ARRAY,
                      description: "Exact bounding box [ymin, xmin, ymax, xmax] normalized 0 to 1000.",
                      items: {
                        type: Type.NUMBER,
                      },
                    },
                    alignment: {
                      type: Type.STRING,
                      description: "Text alignment: 'left', 'center', or 'right'.",
                    },
                    fontWeight: {
                      type: Type.STRING,
                      description: "'bold' for headers, section titles, or bold stems; 'normal' for body text.",
                    },
                    role: {
                      type: Type.STRING,
                      description:
                        "One of: 'header', 'instruction', 'question', 'option', 'table_cell', 'diagram_label', 'marks', 'footer'.",
                    },
                  },
                  required: [
                    "id",
                    "originalText",
                    "translatedText",
                    "sourceLanguage",
                    "box_2d",
                    "alignment",
                    "fontWeight",
                    "role",
                  ],
                },
              },
            },
            required: ["detectedLanguage", "paperTitle", "blocks"],
          },
        },
      });

      const rawText = (response.text ?? "{}").trim();
      const parsed = JSON.parse(rawText);
      res.json(parsed);
    } catch (error: unknown) {
      console.error("Error in /api/translate-page:", error);
      const errMessage =
        error instanceof Error ? error.message : "Failed to process and translate exam page.";
      res.status(500).json({ error: errMessage });
    }
  });

  // Endpoint to refine or re-translate a single block with academic context
  app.post("/api/refine-block", async (req, res) => {
    try {
      const { originalText, currentTranslation, subjectContext = "Academic Examination Paper", instruction = "" } = req.body;
      if (!originalText) {
        res.status(400).json({ error: "Missing originalText." });
        return;
      }

      const ai = getGenAIClient();
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `Original Sinhala/Tamil Exam Text: "${originalText}"
Current English Translation: "${currentTranslation || ""}"
Subject Context: ${subjectContext}
Additional Instruction: ${instruction || "Provide the most concise, formal examination-grade English translation that fits neatly in the same spatial bounding box."}

Return JSON with translatedText and terminologyNotes.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translatedText: {
                type: Type.STRING,
                description: "Refined formal examination English translation.",
              },
              terminologyNotes: {
                type: Type.STRING,
                description: "Brief note on academic/scientific terminology choice.",
              },
            },
            required: ["translatedText", "terminologyNotes"],
          },
        },
      });

      const rawText = (response.text ?? "{}").trim();
      res.json(JSON.parse(rawText));
    } catch (error: unknown) {
      console.error("Error in /api/refine-block:", error);
      const errMessage = error instanceof Error ? error.message : "Failed to refine block translation.";
      res.status(500).json({ error: errMessage });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`LexiPaper server running on http://localhost:${PORT}`);
  });
}

startServer();
