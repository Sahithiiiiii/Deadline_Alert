"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractDeadlines = extractDeadlines;
require("dotenv/config");
const genai_1 = require("@google/genai");
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing from backend/.env");
}
const ai = new genai_1.GoogleGenAI({ apiKey });
async function extractDeadlines(extractedText) {
    const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
        contents: `
You are a deadline extraction assistant for ActionLens.

Analyze the document text below and identify actionable deadlines
that a user may need to remember.

Rules:
- Include application closing dates, payment due dates, renewal
  dates, submission deadlines, and similar actionable deadlines.
- Do not treat every date as a deadline.
- Exclude publication dates, event dates, and start dates unless
  they also represent an actionable deadline.
- Never invent dates or supporting evidence.
- If the year is unclear, do not guess. Omit that deadline for now.
- If no actionable deadlines exist, return an empty array.
- Return only valid JSON matching this structure:
{
  "deadlines": [
    {
      "event": "Short description",
      "date": "YYYY-MM-DD",
      "evidence": "Exact supporting text from the document",
      "confidence": 0.95
    }
  ]
}

DOCUMENT TEXT:
${extractedText}
`,
    });
    const responseText = response.text;
    if (!responseText) {
        throw new Error("Gemini returned an empty response");
    }
    let parsed;
    try {
        parsed = JSON.parse(responseText);
    }
    catch {
        throw new Error("Gemini returned invalid JSON");
    }
    if (!parsed || !Array.isArray(parsed.deadlines)) {
        throw new Error("Gemini response has an invalid deadlines format");
    }
    for (const deadline of parsed.deadlines) {
        if (typeof deadline.event !== "string" ||
            typeof deadline.date !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(deadline.date) ||
            Number.isNaN(Date.parse(`${deadline.date}T00:00:00Z`)) ||
            typeof deadline.evidence !== "string" ||
            typeof deadline.confidence !== "number" ||
            deadline.confidence < 0 ||
            deadline.confidence > 1) {
            throw new Error("Gemini returned an invalid deadline");
        }
    }
    return parsed;
}
