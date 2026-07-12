export type Sex = 'female' | 'male';
export type Goal = 'lose' | 'maintain' | 'gain';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

const ACTIVITY_FACTORS: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_ADJUSTMENT: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  gain: 350,
};

// Safety rails so the calculator can never hand back an unreasonable
// or unsafe number, no matter what inputs come out of onboarding.
// These mirror standard public-health guidance (a max ~1000 kcal/day
// deficit, and floors around the widely-cited 1200 kcal / 1500 kcal
// minimums for women and men respectively).
const MAX_DEFICIT = 1000;
const MAX_SURPLUS = 700;
const ABSOLUTE_MIN_CALORIES = 1000;
const SEX_MIN_CALORIES: Record<Sex, number> = {
  female: 1200,
  male: 1500,
};

export interface Profile {
  age: number;
  sex: Sex;
  height_cm: number;
  weight_kg: number;
  goal: Goal;
  activity: Activity;
}

/** Mifflin-St Jeor equation */
export function calcBMR({ age, sex, height_cm, weight_kg }: Profile): number {
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

export function calcDailyTarget(profile: Profile) {
  const bmr = calcBMR(profile);
  const tdee = bmr * ACTIVITY_FACTORS[profile.activity];

  // Clamp the goal adjustment itself so a "lose" goal never asks for
  // more than a ~1000 kcal/day deficit and "gain" never overshoots a
  // sane surplus, then clamp the final number to a safe floor.
  const rawAdjustment = GOAL_ADJUSTMENT[profile.goal];
  const adjustment = Math.max(-MAX_DEFICIT, Math.min(MAX_SURPLUS, rawAdjustment));

  const floor = Math.max(ABSOLUTE_MIN_CALORIES, SEX_MIN_CALORIES[profile.sex]);
  const calories = Math.max(floor, Math.round(tdee + adjustment));

  // Simple macro split: protein anchored to bodyweight, rest split carbs/fat
  const proteinG = Math.round(profile.weight_kg * (profile.goal === 'lose' ? 2.0 : 1.6));
  const fatG = Math.round((calories * 0.28) / 9);
  const remaining = calories - proteinG * 4 - fatG * 9;
  // If protein + fat alone would already exceed the calorie target
  // (small/older/low-activity bodies with a "lose" goal), scale
  // protein and fat down proportionally instead of letting carbs
  // collapse to 0 and calories silently not add up.
  if (remaining < 0) {
    const scale = calories / (proteinG * 4 + fatG * 9);
    return {
      calories,
      proteinG: Math.round(proteinG * scale),
      fatG: Math.round(fatG * scale),
      carbsG: 0,
    };
  }
  const carbsG = Math.round(remaining / 4);

  return { calories, proteinG, fatG, carbsG };
}
