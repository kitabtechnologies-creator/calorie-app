'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Profile = {
  id: string;
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
};

type LogEntry = {
  id: string;
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: 'ai_photo' | 'manual';
  health_score: number | null;
  recommendation: string | null;
  logged_at: string;
};

type Analysis = {
  foods: { name: string; estimated_weight_g: number }[];
  total: { calories: number; carbs: number; protein: number; fat: number };
  health_score: number;
  accuracy: number;
  recommendation: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [analyzing, setAnalyzing] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState<Analysis | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(p);

      const { data: l } = await supabase
        .from('logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('log_date', todayISO())
        .order('logged_at', { ascending: false });
      setLogs(l || []);
      setLoading(false);
    })();
  }, []);

  const totals = useMemo(
    () =>
      logs.reduce(
        (acc, l) => ({
          calories: acc.calories + Number(l.calories),
          protein: acc.protein + Number(l.protein_g),
          carbs: acc.carbs + Number(l.carbs_g),
          fat: acc.fat + Number(l.fat_g),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      ),
    [logs]
  );

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzeError(null);
    setAnalyzing(true);
    setPendingAnalysis(null);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: file.type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setPendingAnalysis(data);
    } catch (err: any) {
      setAnalyzeError(err.message || 'Could not analyze that photo. Try a clearer shot.');
    } finally {
      setAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function confirmAnalysis() {
    if (!pendingAnalysis) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const name = pendingAnalysis.foods.map((f) => f.name).join(', ');
    const { data, error } = await supabase
      .from('logs')
      .insert({
        user_id: user.id,
        name,
        source: 'ai_photo',
        calories: pendingAnalysis.total.calories,
        carbs_g: pendingAnalysis.total.carbs,
        protein_g: pendingAnalysis.total.protein,
        fat_g: pendingAnalysis.total.fat,
        health_score: pendingAnalysis.health_score,
        accuracy: pendingAnalysis.accuracy,
        recommendation: pendingAnalysis.recommendation,
        foods: pendingAnalysis.foods,
        log_date: todayISO(),
      })
      .select()
      .single();

    if (!error && data) setLogs((prev) => [data, ...prev]);
    setPendingAnalysis(null);
  }

  async function runSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const res = await fetch(`/api/food-search?q=${encodeURIComponent(searchQuery)}`);
    const data = await res.json();
    setSearchResults(data.results || []);
    setSearching(false);
  }

  async function addSearchResult(food: any, grams: number) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const factor = grams / 100;

    const { data, error } = await supabase
      .from('logs')
      .insert({
        user_id: user.id,
        name: `${food.name} (${grams}g)`,
        source: 'manual',
        calories: Math.round(food.per100g.calories * factor),
        carbs_g: Math.round(food.per100g.carbs * factor),
        protein_g: Math.round(food.per100g.protein * factor),
        fat_g: Math.round(food.per100g.fat * factor),
        log_date: todayISO(),
      })
      .select()
      .single();

    if (!error && data) setLogs((prev) => [data, ...prev]);
    setSearchResults([]);
    setSearchQuery('');
  }

  async function removeLog(id: string) {
    await supabase.from('logs').delete().eq('id', id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center text-muted">Loading…</main>;
  }

  return (
    <main className="min-h-screen px-4 py-8 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <p className="font-cond tracking-[0.3em] text-citrus text-xs">TODAY</p>
          <h1 className="font-display text-2xl">Daily Value</h1>
        </div>
        <nav className="flex gap-4 font-cond text-sm">
          <Link href="/history" className="underline underline-offset-4">
            History
          </Link>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = '/login';
            }}
            className="text-muted"
          >
            Sign out
          </button>
        </nav>
      </header>

      {/* Nutrition facts label: today's summary */}
      <section className="nutri-label mb-6">
        <div className="thick" />
        <div className="row">
          <h2 className="font-display text-xl">Today's Totals</h2>
          <span className="font-cond text-sm">Target: {profile?.target_calories} kcal</span>
        </div>
        <div className="med" />
        <div className="flex items-baseline justify-between">
          <span className="font-display text-4xl">{Math.round(totals.calories)}</span>
          <span className="font-cond text-sm">
            kcal ·{' '}
            {profile ? Math.max(0, profile.target_calories - Math.round(totals.calories)) : 0} left
          </span>
        </div>
        <div className="thin" />
        {(
          [
            ['Protein', totals.protein, profile?.target_protein_g, 'bg-protein'],
            ['Carbs', totals.carbs, profile?.target_carbs_g, 'bg-carbs'],
            ['Fat', totals.fat, profile?.target_fat_g, 'bg-fat'],
          ] as [string, number, number | undefined, string][]
        ).map(([label, value, target, color]) => (
          <div key={label} className="mb-2">
            <div className="row text-sm font-cond font-semibold">
              <span>{label}</span>
              <span>
                {Math.round(value)}g / {target ?? '—'}g
              </span>
            </div>
            <div className="h-2 bg-paperdim rounded-full overflow-hidden border border-ink/20">
              <div
                className={`h-full ${color}`}
                style={{ width: `${target ? Math.min(100, (value / target) * 100) : 0}%` }}
              />
            </div>
          </div>
        ))}
      </section>

      {/* Log a meal */}
      <section className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-panel border border-line rounded-card p-4">
          <h3 className="font-cond font-semibold text-lg mb-2">📷 Snap a meal</h3>
          <p className="text-muted text-sm mb-3">Gemini estimates calories and macros from a photo.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhoto}
            className="hidden"
            id="photo-input"
          />
          <label
            htmlFor="photo-input"
            className="block text-center cursor-pointer bg-citrus text-ink font-cond font-semibold py-2 rounded-sm"
          >
            {analyzing ? 'Analyzing…' : 'Upload photo'}
          </label>
          {analyzeError && <p className="text-fat text-sm mt-2">{analyzeError}</p>}
        </div>

        <div className="bg-panel border border-line rounded-card p-4">
          <h3 className="font-cond font-semibold text-lg mb-2">🔍 Search a food</h3>
          <p className="text-muted text-sm mb-3">Free USDA nutrition database, per 100g.</p>
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              placeholder="e.g. banana"
              className="flex-1 px-3 py-2 rounded-sm bg-ink border border-line text-sm"
            />
            <button
              onClick={runSearch}
              className="px-3 py-2 bg-paper text-ink rounded-sm font-cond font-semibold text-sm"
            >
              {searching ? '…' : 'Go'}
            </button>
          </div>
          {searchResults.length > 0 && (
            <ul className="mt-3 space-y-2 max-h-48 overflow-y-auto">
              {searchResults.map((food) => (
                <li key={food.fdcId} className="flex items-center justify-between text-sm gap-2">
                  <span className="truncate flex-1">{food.name}</span>
                  <button
                    onClick={() => addSearchResult(food, 100)}
                    className="text-citrus underline whitespace-nowrap"
                  >
                    + 100g
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Pending AI analysis confirmation */}
      {pendingAnalysis && (
        <section className="nutri-label mb-6">
          <div className="thick" />
          <h3 className="font-display text-lg">Confirm what Gemini saw</h3>
          <p className="text-sm font-cond mt-1">
            Confidence: {pendingAnalysis.accuracy}% · Health score: {pendingAnalysis.health_score}/10
          </p>
          <div className="thin" />
          <ul className="text-sm mb-2 font-cond">
            {pendingAnalysis.foods.map((f, i) => (
              <li key={i}>
                • {f.name} (~{f.estimated_weight_g}g)
              </li>
            ))}
          </ul>
          <p className="font-cond text-sm mb-3">
            {pendingAnalysis.total.calories} kcal · P{pendingAnalysis.total.protein}g · C
            {pendingAnalysis.total.carbs}g · F{pendingAnalysis.total.fat}g
          </p>
          <p className="text-sm italic mb-3">{pendingAnalysis.recommendation}</p>
          <div className="flex gap-2">
            <button
              onClick={confirmAnalysis}
              className="flex-1 bg-ink text-paper font-cond font-semibold py-2 rounded-sm"
            >
              Add to log
            </button>
            <button
              onClick={() => setPendingAnalysis(null)}
              className="px-4 border border-ink rounded-sm font-cond"
            >
              Discard
            </button>
          </div>
        </section>
      )}

      {/* Today's entries */}
      <section>
        <h3 className="font-cond font-semibold text-lg mb-2 text-paper">Logged today</h3>
        {logs.length === 0 && <p className="text-muted text-sm">Nothing logged yet — add your first meal above.</p>}
        <ul className="space-y-2">
          {logs.map((l) => (
            <li
              key={l.id}
              className="bg-panel border border-line rounded-card p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-cond font-semibold truncate">{l.name}</p>
                <p className="text-muted text-xs">
                  {Math.round(l.calories)} kcal · P{Math.round(l.protein_g)} C{Math.round(l.carbs_g)} F
                  {Math.round(l.fat_g)} · {l.source === 'ai_photo' ? 'AI photo' : 'Manual'}
                </p>
              </div>
              <button onClick={() => removeLog(l.id)} className="text-fat text-sm shrink-0">
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
