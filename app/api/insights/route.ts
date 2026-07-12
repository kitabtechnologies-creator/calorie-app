import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { profile, recentLogs } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are a supportive, evidence-based nutrition coach reviewing a user's recent food log.
Profile: ${JSON.stringify(profile)}
Daily targets: calories ${profile?.target_calories}, protein ${profile?.target_protein_g}g, carbs ${profile?.target_carbs_g}g, fat ${profile?.target_fat_g}g.
Recent log entries (most recent first): ${JSON.stringify(recentLogs).slice(0, 12000)}

Write a short, encouraging analysis (max 120 words) covering:
1. One clear pattern you notice (timing, macro balance, consistency, or calorie trend).
2. One specific, actionable suggestion for the next few days.
Do not use markdown headers. Plain sentences only. Speak directly to the person as "you".`;

    const result = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'models/gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 400 },
    });

    return NextResponse.json({ insight: result.text ?? '' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Insight generation failed' }, { status: 500 });
  }
}
