import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// USDA FoodData Central is a free, no-cost nutrition database.
// Get a free key (instant, no approval wait) at https://fdc.nal.usda.gov/api-key-signup.html
const NUTRIENT_IDS: Record<string, number> = {
  calories: 1008, // Energy (kcal)
  protein: 1003,
  fat: 1004,
  carbs: 1005,
};

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q');
  if (!q) return NextResponse.json({ error: 'Missing q param' }, { status: 400 });

  const apiKey = process.env.USDA_API_KEY || 'DEMO_KEY';

  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(
    q
  )}&pageSize=10&dataType=Foundation,SR%20Legacy&api_key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    return NextResponse.json({ error: 'USDA lookup failed' }, { status: 502 });
  }
  const data = await res.json();

  const results = (data.foods || []).map((food: any) => {
    const per100g: Record<string, number> = { calories: 0, protein: 0, fat: 0, carbs: 0 };
    for (const n of food.foodNutrients || []) {
      for (const [key, id] of Object.entries(NUTRIENT_IDS)) {
        if (n.nutrientId === id) per100g[key] = n.value ?? 0;
      }
    }
    return {
      fdcId: food.fdcId,
      name: food.description,
      per100g,
    };
  });

  return NextResponse.json({ results });
}
