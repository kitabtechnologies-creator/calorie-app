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
  const calories = Math.round(tdee + GOAL_ADJUSTMENT[profile.goal]);

  // Simple macro split: protein anchored to bodyweight, rest split carbs/fat
  const proteinG = Math.round(profile.weight_kg * (profile.goal === 'lose' ? 2.0 : 1.6));
  const fatG = Math.round((calories * 0.28) / 9);
  const remaining = calories - proteinG * 4 - fatG * 9;
  const carbsG = Math.max(0, Math.round(remaining / 4));

  return { calories, proteinG, fatG, carbsG };
}
