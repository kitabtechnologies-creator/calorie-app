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

// Distinct, bright rainbow colors for macros
const MACROS: { key: 'protein' | 'carbs' | 'fat'; label: string; from: string; to: string; targetKey: keyof Profile }[] = [
  { key: 'protein', label: 'Protein', from: '#FF3B30', to: '#FF9500', targetKey: 'target_protein_g' }, // Red to Orange
  { key: 'carbs', label: 'Carbs', from: '#4CD964', to: '#5AC8FA', targetKey: 'target_carbs_g' },       // Green to Cyan
  { key: 'fat', label: 'Fat', from: '#007AFF', to: '#5856D6', targetKey: 'target_fat_g' },             // Blue to Purple
];

// Reusable Noise Texture Component (Arc Style)
const NoiseOverlay = () => (
  <div 
    className="absolute inset-0 pointer-events-none opacity-[0.12] mix-blend-overlay z-0 rounded-inherit"
    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
  />
);

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
    <div className="bg-white rounded-[28px] p-5 shadow-[0_8px_40px_rgb(0,0,0,0.06)] border border-neutral-100 flex flex-col justify-between">
      <div className="flex flex-col mb-4">
        <p className="text-[11px] uppercase font-black tracking-widest text-neutral-400 mb-1">{label}</p>
        <p className="font-black text-2xl text-black tracking-tight">
          {Math.round(animated)}
          <span className="text-neutral-400 text-sm ml-0.5">/{target || '—'}g</span>
        </p>
      </div>
      <div className="h-3 w-full rounded-full bg-neutral-100 overflow-hidden relative">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="absolute top-0 left-0 h-full rounded-full"
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
  
  const R = 120;
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
      <main className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-neutral-100 border-t-[#007AFF] animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen relative overflow-hidden bg-white selection:bg-[#FF3B30]/20 selection:text-black">
      
      {/* Background Rainbow Stream (Blurred, passing through) */}
      <div className="fixed inset-0 -z-50 pointer-events-none overflow-hidden bg-white">
        <NoiseOverlay />
        <motion.div 
          animate={{ x: ["-50%", "0%", "-50%"], y: ["-10%", "10%", "-10%"] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute top-[10%] left-[-20%] w-[150vw] h-[40vh] bg-gradient-to-r from-[#FF3B30] via-[#FFCC00] to-[#4CD964] opacity-[0.15] blur-[100px] rounded-full rotate-12" 
        />
        <motion.div 
          animate={{ x: ["0%", "-50%", "0%"], y: ["10%", "-10%", "10%"] }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[10%] right-[-20%] w-[150vw] h-[40vh] bg-gradient-to-l from-[#5856D6] via-[#007AFF] to-[#5AC8FA] opacity-[0.15] blur-[100px] rounded-full -rotate-12" 
        />
      </div>

      <div className="relative z-10 px-6 pt-16 pb-40 max-w-lg mx-auto space-y-12">
        
        {/* Apple Music Style Header */}
        <header className="space-y-4">
          <div className="flex justify-between items-end">
            <h1 className="text-5xl font-black text-black tracking-tighter leading-[1.05]">
              <span className="text-neutral-400 font-bold text-2xl tracking-normal block mb-1">Good Morning,</span>
              {profile?.name || 'Sunnat'}
            </h1>
            <Link 
              href="/history" 
              className="bg-black text-white px-5 py-2.5 rounded-full font-bold text-sm tracking-wide shadow-lg hover:scale-105 transition-transform active:scale-95"
            >
              Profile
            </Link>
          </div>
          <p className="text-lg font-bold text-neutral-500 tracking-tight">
            {remaining > 0 
              ? `You have ${remaining} kcal remaining today.`
              : `You've met your daily nutrition goals.`}
          </p>
        </header>

        {/* Minimalist Week Strip */}
        <section className="flex justify-between items-center px-2">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => {
            const isToday = idx === new Date().getDay() - 1; 
            return (
              <div 
                key={idx} 
                className={`w-11 h-11 flex items-center justify-center rounded-full text-[15px] font-black transition-all ${
                  isToday 
                    ? 'bg-gradient-to-tr from-[#FF3B30] via-[#FF9500] to-[#FFCC00] text-white shadow-xl scale-125 z-10 relative' 
                    : 'text-neutral-300 bg-neutral-50'
                }`}
              >
                {isToday && <NoiseOverlay />}
                <span className="relative z-10">{day}</span>
              </div>
            );
          })}
        </section>

        {/* Hero Liquid Rainbow Calorie Ring */}
        <motion.section 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex justify-center py-6"
        >
          <div className="relative w-[320px] h-[320px] flex items-center justify-center">
            <svg viewBox="0 0 280 280" className="relative w-full h-full -rotate-90 drop-shadow-2xl">
              <defs>
                <linearGradient id="fullRainbow" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FF3B30" />
                  <stop offset="25%" stopColor="#FF9500" />
                  <stop offset="50%" stopColor="#FFCC00" />
                  <stop offset="75%" stopColor="#4CD964" />
                  <stop offset="100%" stopColor="#007AFF" />
                </linearGradient>
              </defs>
              {/* Clean Background Track */}
              <circle cx="140" cy="140" r={R} fill="none" stroke="#F5F5F7" strokeWidth="24" />
              {/* Full Rainbow Progress Track */}
              <motion.circle
                cx="140"
                cy="140"
                r={R}
                fill="none"
                stroke="url(#fullRainbow)"
                strokeWidth="24"
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
                className="text-7xl font-black text-black tracking-tighter tabular-nums"
              >
                {Math.round(animatedCalories)}
              </motion.span>
              <span className="text-sm font-black uppercase tracking-widest text-neutral-400 mt-2">
                / {target} kcal
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
              className="bg-black rounded-[32px] p-8 shadow-2xl relative overflow-hidden text-white"
            >
              <NoiseOverlay />
              <div className="relative z-10">
                <h3 className="text-2xl font-black mb-2 tracking-tight">We detected your meal</h3>
                <p className="text-sm font-medium text-neutral-400 mb-6">
                  Confidence: {pendingAnalysis.accuracy}% • {pendingAnalysis.total.calories} kcal
                </p>
                
                <div className="flex flex-wrap gap-2 mb-6">
                  {pendingAnalysis.foods.map((f, i) => (
                    <div key={i} className="bg-white/10 backdrop-blur-md text-white text-sm font-bold px-4 py-2 rounded-full border border-white/10">
                      {f.name} <span className="opacity-50 ml-1 font-normal">{f.estimated_weight_g}g</span>
                    </div>
                  ))}
                </div>

                {pendingAnalysis.recommendation && (
                  <p className="text-sm text-neutral-300 bg-white/5 p-4 rounded-2xl mb-6 font-medium leading-relaxed">
                    "{pendingAnalysis.recommendation}"
                  </p>
                )}

                <div className="flex gap-4">
                  <button
                    onClick={confirmAnalysis}
                    className="flex-1 bg-gradient-to-r from-[#FF3B30] to-[#FF9500] text-white font-black text-lg py-4 rounded-2xl shadow-lg hover:scale-[1.02] transition-transform active:scale-95"
                  >
                    Log Meal
                  </button>
                  <button
                    onClick={() => setPendingAnalysis(null)}
                    className="px-6 bg-white/10 text-white font-bold rounded-2xl hover:bg-white/20 transition-colors"
                  >
                    Discard
                  </button>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Minimalist Search */}
        <section className="bg-neutral-50 rounded-[32px] p-2 shadow-sm border border-neutral-100">
          <button
            onClick={() => setSearchOpen((v) => !v)}
            className="w-full flex items-center justify-between p-4 font-black text-black hover:opacity-70 transition-opacity"
          >
            <span className="flex items-center gap-3 text-lg tracking-tight">
              <svg className="w-6 h-6 text-[#007AFF]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              Search Database
            </span>
            <span className="text-3xl font-light text-neutral-400 leading-none">{searchOpen ? '−' : '+'}</span>
          </button>
          
          <AnimatePresence>
            {searchOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden px-3"
              >
                <div className="flex gap-3 py-3">
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                    placeholder="e.g. Avocado Toast"
                    className="flex-1 px-5 py-4 rounded-2xl bg-white border-none shadow-sm text-black font-medium placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                  />
                  <button
                    onClick={runSearch}
                    className="px-6 rounded-2xl font-black text-white bg-black hover:bg-neutral-800 transition-colors"
                  >
                    {searching ? '...' : 'Go'}
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <ul className="mt-3 mb-4 space-y-2 max-h-60 overflow-y-auto pr-2">
                    {searchResults.map((food) => (
                      <li key={food.fdcId} className="flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm border border-neutral-100">
                        <span className="text-base font-bold text-black truncate pr-4">{food.name}</span>
                        <button
                          onClick={() => addSearchResult(food, 100)}
                          className="text-sm font-black bg-neutral-100 text-black px-4 py-2 rounded-full hover:bg-[#4CD964] hover:text-white transition-colors whitespace-nowrap"
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

        {/* Today's Meals (Apple Music Tracklist Style) */}
        <section>
          <h3 className="text-sm font-black text-black tracking-tight mb-6 px-2">Today's Meals</h3>
          
          {logs.length === 0 ? (
            <div className="text-center py-12 bg-neutral-50 rounded-[32px] border border-neutral-200 border-dashed">
              <p className="text-neutral-500 font-bold text-sm">Tap the rainbow orb below to scan your first meal.</p>
            </div>
          ) : (
            <ul className="space-y-3">
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
                      className="bg-white rounded-[28px] p-5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-neutral-100 cursor-pointer hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all"
                      onClick={() => setExpandedLogId(isExpanded ? null : l.id)}
                    >
                      <div className="flex items-center justify-between gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-neutral-50 flex items-center justify-center text-2xl shrink-0">
                          {l.source === 'ai_photo' ? '✨' : '🥗'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-black text-xl tracking-tight truncate">{l.name}</p>
                          <div className="flex gap-3 items-center mt-1">
                            <span className="text-sm font-bold text-neutral-500">{Math.round(l.calories)} kcal</span>
                            {l.health_score && (
                              <span className="text-[11px] font-black uppercase bg-[#4CD964]/10 text-[#4CD964] px-2.5 py-1 rounded-lg">
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
                            <div className="pt-6 mt-4 border-t border-neutral-100">
                              <div className="grid grid-cols-3 gap-3 text-center mb-5">
                                <div className="bg-neutral-50 p-3 rounded-2xl">
                                  <span className="block text-[11px] font-black uppercase text-neutral-400 mb-1">Protein</span>
                                  <span className="text-lg font-black text-black">{Math.round(l.protein_g)}g</span>
                                </div>
                                <div className="bg-neutral-50 p-3 rounded-2xl">
                                  <span className="block text-[11px] font-black uppercase text-neutral-400 mb-1">Carbs</span>
                                  <span className="text-lg font-black text-black">{Math.round(l.carbs_g)}g</span>
                                </div>
                                <div className="bg-neutral-50 p-3 rounded-2xl">
                                  <span className="block text-[11px] font-black uppercase text-neutral-400 mb-1">Fat</span>
                                  <span className="text-lg font-black text-black">{Math.round(l.fat_g)}g</span>
                                </div>
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); removeLog(l.id); }} 
                                className="w-full text-sm font-black bg-[#FF3B30]/10 text-[#FF3B30] hover:bg-[#FF3B30] hover:text-white py-4 rounded-2xl transition-colors"
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

      {/* Hidden inputs */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
      <input ref={galleryInputRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />

      {/* Floating Rainbow Texture Orb */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center">
        <AnimatePresence>
          {orbOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className="absolute bottom-28 bg-white p-3 rounded-[32px] shadow-2xl border border-neutral-100 flex flex-col gap-2 min-w-[220px]"
            >
              <button onClick={() => cameraInputRef.current?.click()} className="flex items-center gap-4 px-5 py-4 rounded-2xl text-base font-black text-black hover:bg-neutral-50 transition-colors">
                <span className="text-xl">📷</span> Camera
              </button>
              <button onClick={() => galleryInputRef.current?.click()} className="flex items-center gap-4 px-5 py-4 rounded-2xl text-base font-black text-black hover:bg-neutral-50 transition-colors">
                <span className="text-xl">🖼️</span> Gallery
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          onClick={() => setOrbOpen(!orbOpen)}
          animate={{ 
            scale: analyzing ? [1, 1.1, 1] : 1,
            rotate: orbOpen ? 45 : 0
          }}
          transition={{ duration: analyzing ? 1.5 : 0.4, repeat: analyzing ? Infinity : 0, type: "spring", stiffness: 300, damping: 20 }}
          whileTap={{ scale: 0.9 }}
          className="relative w-20 h-20 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.15)] flex items-center justify-center overflow-hidden z-50"
        >
          {/* Base Arc-style Rainbow Gradient */}
          <div className="absolute inset-0 bg-gradient-to-tr from-[#FF3B30] via-[#FFCC00] to-[#007AFF]" />
          {/* Noise layer directly on the orb */}
          <NoiseOverlay />
          
          <div className="relative z-10">
            {analyzing ? (
              <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            )}
          </div>
        </motion.button>
      </div>

      {/* Minimalist Success Toast */}
      <AnimatePresence>
        {justAdded && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-black text-white px-8 py-4 rounded-full text-sm font-black shadow-2xl flex items-center gap-3"
          >
            <span className="text-[#4CD964]">✓</span> Logged successfully
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
