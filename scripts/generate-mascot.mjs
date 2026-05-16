#!/usr/bin/env node
// Generate the TrustMeBro mascot via Gemini 2.5 Flash Image (Nano Banana).
// Reads GOOGLE_API_KEY from .env.local or .env.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";

function loadDotenv() {
  for (const path of [".env.local", ".env"]) {
    if (existsSync(path)) {
      const raw = readFileSync(path, "utf8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
      }
    }
  }
}
loadDotenv();

const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("ERROR: GOOGLE_API_KEY (or GEMINI_API_KEY) not set.");
  process.exit(1);
}

const targets = [
  {
    out: "public/Design/mascot-hero.png",
    prompt: `Vibrant mascot logo illustration of a bright yellow smiley face character
wearing a backward-facing black snapback cap with the text "IN DATA WE TRUST"
on the front of the cap in yellow letters. The character has one eye winking,
a confident grin, and a black hoodie. The character is making the "hang loose"
shaka hand sign (thumb and pinky extended, three middle fingers curled) with
one yellow hand. The other yellow hand is holding a fan of green hundred dollar
bills. The art style is bold modern sports esports streetwear illustration with
thick black outlines and clean cel-shading. The color palette is pure black hoodie,
bright Lakers gold yellow (#FFB800) for skin and accents, white teeth, green cash.
The background is fully TRANSPARENT (alpha channel, no background, no shadow,
no scene). Square 1024x1024 with the character centered, full body from waist up.
Production-quality vector-style illustration, NO photorealism, NO 3D rendering,
NO text artifacts outside the cap.`,
  },
];

const ai = new GoogleGenAI({ apiKey });

for (const { out, prompt } of targets) {
  console.log(`Generating ${out} ...`);
  const candidateModels = [
    "nano-banana-pro-preview",
    "gemini-3.1-flash-image-preview",
    "gemini-3-pro-image-preview",
    "gemini-2.5-flash-image",
  ];
  let response;
  let lastErr;
  for (const model of candidateModels) {
    try {
      console.log(`  trying model: ${model}`);
      response = await ai.models.generateContent({ model, contents: prompt });
      break;
    } catch (e) {
      lastErr = e;
      console.log(`    failed (${e?.status || ""}): ${String(e?.message || e).slice(0, 200)}`);
    }
  }
  if (!response) throw lastErr;

  let saved = false;
  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const buf = Buffer.from(part.inlineData.data, "base64");
      writeFileSync(out, buf);
      console.log(`  -> wrote ${buf.length} bytes to ${out}`);
      saved = true;
    } else if (part.text) {
      console.log(`  model text: ${part.text.slice(0, 200)}`);
    }
  }
  if (!saved) {
    console.error("  NO IMAGE in response");
    console.error(JSON.stringify(response, null, 2).slice(0, 1200));
    process.exit(2);
  }
}

console.log("Done.");
