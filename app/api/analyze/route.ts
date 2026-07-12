import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `You are an expert nutrition assistant.
Analyze the uploaded food image.
Your task is to identify all visible foods, estimate their serving sizes, and calculate the nutritional values for the ENTIRE meal shown.
Return ONLY valid JSON.
Do not include markdown, explanations, or any extra text.
Schema:
{
  "foods": [
    { "name": "Chicken breast", "estimated_weight_g": 180 },
    { "name": "Rice", "estimated_weight_g": 200 }
  ],
  "total": { "calories": 620, "carbs": 58, "protein": 46, "fat": 18 },
  "health_score": 8.4,
  "accuracy": 88,
  "recommendation": "Add a serving of vegetables for more fiber and micronutrients."
}
Rules:
- calories are in kcal
- carbs, protein, fat, and weight are in grams
- Use numbers, not strings.
- Estimate portion sizes using visual cues.
- Calculate nutrition for the entire meal, not per food.
- health_score is from 1 to 10.
- accuracy is from 0 to 100 and represents confidence in the estimate.
- recommendation should be one concise sentence.
- If the image quality is poor, reduce the accuracy score.
- If some ingredients cannot be identified, make the best reasonable estimate.
- Always return valid JSON.`;

export async function POST(req: NextRequest) {
  try {
    const { image, mimeType } = await req.json();
    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const result = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'models/gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: SYSTEM_PROMPT },
            { inlineData: { data: image, mimeType: mimeType || 'image/jpeg' } },
          ],
        },
      ],
      config: {
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    });

    const text = result.text ?? '';
    const cleaned = text.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: 'Model did not return valid JSON', raw: text },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Analysis failed' }, { status: 500 });
  }
}
