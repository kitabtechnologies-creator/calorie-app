'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { calcDailyTarget, type Activity, type Goal, type Sex } from '@/lib/nutrition';

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [age, setAge] = useState(30);
  const [sex, setSex] = useState<Sex>('female');
  const [heightCm, setHeightCm] = useState(165);
  const [weightKg, setWeightKg] = useState(70);
  const [goal, setGoal] = useState<Goal>('lose');
  const [activity, setActivity] = useState<Activity>('light');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('Your session expired. Please sign in again.');
      setSaving(false);
      return;
    }

    const profile = { age, sex, height_cm: heightCm, weight_kg: weightKg, goal, activity };
    const targets = calcDailyTarget(profile);

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      ...profile,
      target_calories: targets.calories,
      target_protein_g: targets.proteinG,
      target_carbs_g: targets.carbsG,
      target_fat_g: targets.fatG,
      updated_at: new Date().toISOString(),
    });

    setSaving(false);
    if (error) return setError(error.message);
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="min-h-screen px-4 py-10 flex justify-center">
      <div className="w-full max-w-md">
        <p className="font-cond tracking-[0.3em] text-citrus text-xs mb-1 text-center">NUTRITION FACTS</p>
        <h1 className="font-display text-2xl text-center mb-8">Tell us about you</h1>

        <form onSubmit={handleSubmit} className="nutri-label space-y-4">
          <div className="thick" />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase font-semibold">Age</label>
              <input
                type="number"
                min={13}
                max={100}
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                className="w-full mt-1 px-3 py-2 border border-ink bg-white text-ink rounded-sm"
              />
            </div>
            <div>
              <label className="text-xs uppercase font-semibold">Sex</label>
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value as Sex)}
                className="w-full mt-1 px-3 py-2 border border-ink bg-white text-ink rounded-sm"
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase font-semibold">Height (cm)</label>
              <input
                type="number"
                min={100}
                max={230}
                value={heightCm}
                onChange={(e) => setHeightCm(Number(e.target.value))}
                className="w-full mt-1 px-3 py-2 border border-ink bg-white text-ink rounded-sm"
              />
            </div>
            <div>
              <label className="text-xs uppercase font-semibold">Weight (kg)</label>
              <input
                type="number"
                min={30}
                max={300}
                value={weightKg}
                onChange={(e) => setWeightKg(Number(e.target.value))}
                className="w-full mt-1 px-3 py-2 border border-ink bg-white text-ink rounded-sm"
              />
            </div>
          </div>

          <div className="med" />

          <div>
            <label className="text-xs uppercase font-semibold">Goal</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {(['lose', 'maintain', 'gain'] as Goal[]).map((g) => (
                <button
                  type="button"
                  key={g}
                  onClick={() => setGoal(g)}
                  className={`py-2 text-sm font-cond font-semibold border border-ink rounded-sm capitalize ${
                    goal === g ? 'bg-ink text-paper' : 'bg-white text-ink'
                  }`}
                >
                  {g} weight
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs uppercase font-semibold">Activity level</label>
            <select
              value={activity}
              onChange={(e) => setActivity(e.target.value as Activity)}
              className="w-full mt-1 px-3 py-2 border border-ink bg-white text-ink rounded-sm"
            >
              <option value="sedentary">Sedentary (little to no exercise)</option>
              <option value="light">Light (1-3 days/week)</option>
              <option value="moderate">Moderate (3-5 days/week)</option>
              <option value="active">Active (6-7 days/week)</option>
              <option value="very_active">Very active (physical job / 2x/day)</option>
            </select>
          </div>

          {error && <p className="text-fat text-sm font-semibold">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-ink text-paper font-display text-sm py-3 rounded-sm disabled:opacity-60"
          >
            {saving ? 'Calculating…' : 'Calculate my targets'}
          </button>
        </form>
      </div>
    </main>
  );
}
