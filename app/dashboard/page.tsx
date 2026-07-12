'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';

type Profile = {
  id: string;
  name?: string;
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

/** Smoothly animates a number toward its latest value */
function useCountUp(value: number, duration = 700) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  const raf = useRef<number>();

  useEffect(() => {
    const from = prev.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();

    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (to - from) * eased);
      if (p < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        prev.current = to;
      }
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value]);

  return display;
}

const MACROS: { key: 'protein' | 'carbs' | 'fat'; label: string; from: string; to: string; targetKey: keyof Profile }[] = [
  { key: 'protein', label: 'Protein', from: '#fb923c', to: '#f97316', targetKey: 'target_protein_g' }, // Orange
  { key: 'carbs', label: 'Carbs', from: '#fcd34d', to: '#eab308', targetKey: 'target_carbs_g' },       // Yellow
  { key: 'fat', label: 'Fat', from: '#a3e635', to: '#84cc16', targetKey: 'target_fat_g' },             // Lime
];

function MacroCapsule({
  label,
  value,
  target,
  from,
  to,
}: {
  label: string;
  value: number;
  target: number;
  from: string;
  to: string;
}) {
  const animated = useCountUp(value);
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  
  return (
    <div className="bg-white/50 backdrop-blur-xl rounded-[32px] p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 transition-transform hover:-translate-y-1.5 duration-300">
      <div className="flex justify-between items-baseline mb-3">
        <p className="text-[10px] uppercase font-bold tracking-widest text-neutral-400">{label}</p>
        <p className="font-semibold text-lg text-neutral-800">
          {Math.round(animated)}
          <span className="text-neutral-400 text-xs font-medium ml-1">/{target || '—'}g</span>
        </p>
      </div>
      <div className="h-2.5 w-full rounded-full bg-neutral-100/80 overflow-hidden inner-shadow">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${from}, ${to})` }}
        />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const supabase = createClient();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [analyzing, setAnalyzing] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState<Analysis | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const [orbOpen, setOrbOpen] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

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

  const target = profile?.target_calories ?? 2000;
  const pct = target > 0 ? Math.max(0, Math.min(1, totals.calories / target)) : 0;
  const remaining = Math.max(0, target - Math.round(totals.calories));

  const animatedCalories = useCountUp(totals.calories);
  
  const R = 110;
  const CIRC = 2 * Math.PI * R;

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOrbOpen(false);
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
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  }

  function pingAdded() {
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  }

  async function confirmAnalysis() {
    if (!pendingAnalysis) return;
    const { data: { user } } = await supabase.auth.getUser();
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

    if (!error && data) {
      setLogs((prev) => [data, ...prev]);
      pingAdded();
    }
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
    const { data: { user } } = await supabase.auth.getUser();
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

    if (!error && data) {
      setLogs((prev) => [data, ...prev]);
      pingAdded();
    }
    setSearchResults([]);
    setSearchQuery('');
    setSearchOpen(false);
  }

  async function removeLog(id: string) {
    setLogs((prev) => prev.filter((l) => l.id !== id));
    await supabase.from('logs').delete().eq('id', id);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FAF8F5] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-orange-200 border-t-orange-500 animate-spin" />
          <p className="text-xs uppercase tracking-widest font-bold text-neutral-400">Waking up AI...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#FAF8F5] selection:bg-orange-200 selection:text-orange-900">
      {/* Premium Layered Background */}
      <div className="fixed inset-0 -z-50 pointer-events-none">
        <motion.div 
          animate={{ scale: [1, 1.05, 1], rotate: [0, 5, 0] }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-20%] left-[-10%] w-[80vw] h-[80vw] rounded-full bg-gradient-to-br from-orange-300/20 to-yellow-300/10 blur-[120px]" 
        />
        <motion.div 
          animate={{ scale: [1, 1.1, 1], rotate: [0, -5, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[-10%] right-[-10%] w-[70vw] h-[70vw] rounded-full bg-gradient-to-tr from-lime-300/20 to-yellow-200/20 blur-[100px]" 
        />
        {/* Subtle Paper Grain */}
        <div className="absolute inset-0 opacity-[0.025] mix-blend-multiply bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZHRoPSI0IiBmaWxsPSIjMDAwIiBmaWxsLW9wYWNpdHk9Ii41Ii8+Cjwvc3ZnPg==')]" />
      </div>

      <div className="relative z-10 px-6 pt-12 pb-32 max-w-lg mx-auto space-y-10">
        
        {/* Top Header & AI Insight */}
        <header className="space-y-3">
          <div className="flex justify-between items-start">
            <h1 className="text-4xl font-light text-neutral-400 tracking-tight">
              Good Morning,<br />
              <span className="font-semibold text-neutral-900">{profile?.name || 'Sunnat'}</span>
            </h1>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = '/login';
              }}
              className="text-xs font-bold uppercase tracking-wider text-neutral-400 hover:text-orange-500 transition-colors"
            >
              Log Out
            </button>
          </div>
          <p className="text-lg font-medium text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-500">
            {remaining > 0 
              ? `You're ${remaining} kcal away from today's goal.`
              : `You've perfectly met your nutrition goals today.`}
          </p>
        </header>

        {/* Week Strip Component */}
        <section className="flex justify-between items-center bg-white/40 backdrop-blur-md rounded-full p-2 border border-white/60 shadow-sm">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => {
            const isToday = idx === new Date().getDay() - 1; // Simplistic today logic
            return (
              <div 
                key={idx} 
                className={`w-10 h-10 flex items-center justify-center rounded-full text-sm font-bold transition-all ${
                  isToday 
                    ? 'bg-gradient-to-tr from-orange-400 to-yellow-400 text-white shadow-md ring-2 ring-white scale-110' 
                    : 'text-neutral-400 hover:bg-white/50'
                }`}
              >
                {day}
              </div>
            );
          })}
        </section>

        {/* Hero Liquid Rainbow Calorie Ring */}
        <motion.section 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex justify-center py-4"
        >
          <div className="relative w-[280px] h-[280px] flex items-center justify-center">
            {/* Soft Ambient Glow Behind Ring */}
            <motion.div 
              animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-[-20px] rounded-full bg-gradient-to-tr from-orange-400 via-yellow-400 to-lime-400 blur-3xl opacity-30" 
            />
            
            <svg viewBox="0 0 240 240" className="relative w-full h-full -rotate-90 drop-shadow-sm">
              <defs>
                <linearGradient id="liquidRing" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f97316" />   {/* Orange 500 */}
                  <stop offset="50%" stopColor="#facc15" />  {/* Yellow 400 */}
                  <stop offset="100%" stopColor="#84cc16" /> {/* Lime 500 */}
                </linearGradient>
              </defs>
              {/* Background Track */}
              <circle cx="120" cy="120" r={R} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="16" />
              {/* Progress Track */}
              <motion.circle
                cx="120"
                cy="120"
                r={R}
                fill="none"
                stroke="url(#liquidRing)"
                strokeWidth="16"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                initial={{ strokeDashoffset: CIRC }}
                animate={{ strokeDashoffset: CIRC * (1 - pct) }}
                transition={{ duration: 1.5, ease: "easeOut" }}
              />
            </svg>
            
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span 
                key={animatedCalories}
                initial={{ y: -5, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="text-6xl font-black text-neutral-800 tracking-tighter tabular-nums"
              >
                {Math.round(animatedCalories)}
              </motion.span>
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-400 mt-1">
                / {target} Goal
              </span>
            </div>
          </div>
        </motion.section>

        {/* Nutrient Capsules */}
        <section className="grid grid-cols-3 gap-4">
          {MACROS.map((m) => (
            <MacroCapsule
              key={m.key}
              label={m.label}
              value={totals[m.key]}
              target={(profile?.[m.targetKey] as number | undefined) ?? 0}
              from={m.from}
              to={m.to}
            />
          ))}
        </section>

        {/* AI Corrections / Confirm Analysis */}
        <AnimatePresence>
          {pendingAnalysis && (
            <motion.section
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, filter: "blur(8px)" }}
              className="bg-white/70 backdrop-blur-xl rounded-[2rem] p-6 shadow-lg border border-white relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 via-yellow-400 to-lime-400" />
              <h3 className="text-xl font-bold text-neutral-800 mb-1">We detected your meal</h3>
              <p className="text-sm font-medium text-neutral-500 mb-4">
                Confidence: {pendingAnalysis.accuracy}% • {pendingAnalysis.total.calories} kcal
              </p>
              
              <div className="flex flex-wrap gap-2 mb-5">
                {pendingAnalysis.foods.map((f, i) => (
                  <div key={i} className="bg-orange-100 text-orange-800 text-sm font-semibold px-3 py-1.5 rounded-full border border-orange-200">
                    {f.name} <span className="opacity-50 ml-1">{f.estimated_weight_g}g</span>
                  </div>
                ))}
              </div>

              {pendingAnalysis.recommendation && (
                <p className="text-sm text-neutral-600 bg-white/50 p-3 rounded-2xl border border-white mb-5 italic">
                  "{pendingAnalysis.recommendation}"
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={confirmAnalysis}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3 rounded-2xl shadow-md hover:shadow-lg transition-all active:scale-95"
                >
                  Log Meal
                </button>
                <button
                  onClick={() => setPendingAnalysis(null)}
                  className="px-5 bg-white/50 text-neutral-600 font-bold rounded-2xl hover:bg-white transition-colors"
                >
                  Discard
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Manual Search (Elegant implementation) */}
        <section className="bg-white/40 backdrop-blur-md rounded-3xl p-2 shadow-sm border border-white/60">
          <button
            onClick={() => setSearchOpen((v) => !v)}
            className="w-full flex items-center justify-between p-3 font-bold text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              Search Database
            </span>
            <span className="text-2xl font-light text-neutral-400 leading-none">{searchOpen ? '−' : '+'}</span>
          </button>
          
          <AnimatePresence>
            {searchOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden px-2"
              >
                <div className="flex gap-2 py-2">
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                    placeholder="e.g. Avocado Toast"
                    className="flex-1 px-4 py-3 rounded-2xl bg-white/60 border border-white text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  />
                  <button
                    onClick={runSearch}
                    className="px-5 rounded-2xl font-bold text-white bg-neutral-800 hover:bg-neutral-900 transition-colors"
                  >
                    {searching ? '...' : 'Go'}
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <ul className="mt-2 mb-2 space-y-2 max-h-60 overflow-y-auto pr-1">
                    {searchResults.map((food) => (
                      <li key={food.fdcId} className="flex items-center justify-between bg-white/50 rounded-2xl p-3 border border-white/40">
                        <span className="text-sm font-semibold text-neutral-700 truncate pr-2">{food.name}</span>
                        <button
                          onClick={() => addSearchResult(food, 100)}
                          className="text-xs font-bold bg-orange-100 text-orange-600 px-3 py-1.5 rounded-full hover:bg-orange-200 transition-colors whitespace-nowrap"
                        >
                          + 100g
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Today's Meals */}
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-4 px-2">Today's Meals</h3>
          
          {logs.length === 0 ? (
            <div className="text-center py-10 bg-white/30 rounded-3xl border border-white/40 border-dashed">
              <p className="text-neutral-400 font-medium text-sm">Tap the AI orb below to scan your first meal.</p>
            </div>
          ) : (
            <ul className="space-y-4">
              <AnimatePresence initial={false}>
                {logs.map((l) => {
                  const isExpanded = expandedLogId === l.id;
                  return (
                    <motion.li
                      key={l.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, filter: 'blur(5px)' }}
                      className="bg-white/50 backdrop-blur-md rounded-[24px] p-5 border border-white/60 shadow-sm cursor-pointer hover:bg-white/70 transition-colors"
                      onClick={() => setExpandedLogId(isExpanded ? null : l.id)}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-orange-100 to-yellow-100 flex items-center justify-center text-2xl shrink-0 shadow-inner">
                          {l.source === 'ai_photo' ? '✨' : '🥗'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-neutral-800 text-lg truncate">{l.name}</p>
                          <div className="flex gap-2 items-center mt-0.5">
                            <span className="text-sm font-bold text-orange-500">{Math.round(l.calories)} kcal</span>
                            {l.health_score && (
                              <span className="text-[10px] font-bold uppercase bg-lime-100 text-lime-700 px-2 py-0.5 rounded-md">
                                Score: {l.health_score}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="pt-4 mt-4 border-t border-neutral-200/50">
                              <div className="grid grid-cols-3 gap-2 text-center mb-4">
                                <div className="bg-white/60 p-2 rounded-xl border border-white">
                                  <span className="block text-[10px] font-bold uppercase text-neutral-400">Protein</span>
                                  <span className="text-sm font-bold text-neutral-800">{Math.round(l.protein_g)}g</span>
                                </div>
                                <div className="bg-white/60 p-2 rounded-xl border border-white">
                                  <span className="block text-[10px] font-bold uppercase text-neutral-400">Carbs</span>
                                  <span className="text-sm font-bold text-neutral-800">{Math.round(l.carbs_g)}g</span>
                                </div>
                                <div className="bg-white/60 p-2 rounded-xl border border-white">
                                  <span className="block text-[10px] font-bold uppercase text-neutral-400">Fat</span>
                                  <span className="text-sm font-bold text-neutral-800">{Math.round(l.fat_g)}g</span>
                                </div>
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); removeLog(l.id); }} 
                                className="w-full text-xs font-bold uppercase tracking-wider text-red-400 hover:text-red-500 py-2 transition-colors"
                              >
                                Delete Entry
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </div>

      {/* Hidden inputs used by the orb menu */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
      <input ref={galleryInputRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />

      {/* Floating AI Orb */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center">
        <AnimatePresence>
          {orbOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className="absolute bottom-24 bg-white/80 backdrop-blur-xl p-2 rounded-3xl shadow-xl border border-white/80 flex flex-col gap-1 min-w-[200px]"
            >
              <button onClick={() => cameraInputRef.current?.click()} className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-neutral-700 hover:bg-white transition-colors">
                <span className="text-lg">📷</span> Take Photo
              </button>
              <button onClick={() => galleryInputRef.current?.click()} className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-neutral-700 hover:bg-white transition-colors">
                <span className="text-lg">🖼️</span> Open Gallery
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          onClick={() => setOrbOpen(!orbOpen)}
          animate={{ 
            y: orbOpen ? 0 : [0, -8, 0],
            scale: analyzing ? [1, 1.1, 1] : 1
          }}
          transition={{ duration: analyzing ? 1.5 : 4, repeat: orbOpen ? 0 : Infinity, ease: 'easeInOut' }}
          whileTap={{ scale: 0.9 }}
          className="relative w-16 h-16 rounded-full p-[3px] shadow-[0_10px_40px_rgba(249,115,22,0.3)] bg-gradient-to-tr from-orange-400 via-yellow-400 to-lime-400 z-50 group"
        >
          <div className="w-full h-full bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-orange-400 to-lime-400 opacity-0 group-hover:opacity-20 transition-opacity duration-300" />
            <motion.div animate={{ rotate: orbOpen ? 45 : 0 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
              {analyzing ? (
                <div className="w-6 h-6 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
              ) : (
                <svg className="w-6 h-6 text-neutral-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              )}
            </motion.div>
          </div>
        </motion.button>
      </div>

      {/* Success Notification */}
      <AnimatePresence>
        {justAdded && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="fixed top-8 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/90 backdrop-blur-md text-white px-6 py-3 rounded-full text-sm font-bold shadow-2xl flex items-center gap-2 border border-neutral-700"
          >
            <span className="text-lime-400">✓</span> Meal logged successfully
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
