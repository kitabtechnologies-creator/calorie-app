'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
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

/** Smoothly animates a number toward its latest value — used for every
 * calorie/macro figure on the dashboard so updates feel alive instead
 * of popping instantly. */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return display;
}

const MACROS: { key: 'protein' | 'carbs' | 'fat'; label: string; from: string; to: string; targetKey: keyof Profile }[] = [
  { key: 'protein', label: 'Protein', from: '#3fd0ff', to: '#4f9dff', targetKey: 'target_protein_g' },
  { key: 'carbs', label: 'Carbs', from: '#ffd15c', to: '#ff9f4a', targetKey: 'target_carbs_g' },
  { key: 'fat', label: 'Fat', from: '#ff5cb8', to: '#b45bff', targetKey: 'target_fat_g' },
];

function MacroPill({
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
    <div className="glass-pill rounded-2xl p-3">
      <p className="font-cond text-[11px] text-white/50 tracking-wide">{label}</p>
      <p className="font-display text-lg text-white">
        {Math.round(animated)}
        <span className="text-white/40 text-xs font-cond">/{target || '—'}g</span>
      </p>
      <div className="h-1.5 mt-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${from}, ${to})`,
            transition: 'width 0.8s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const target = profile?.target_calories ?? 0;
  const pct = target > 0 ? Math.max(0, Math.min(1, totals.calories / target)) : 0;
  const remaining = profile ? Math.max(0, target - Math.round(totals.calories)) : 0;

  const animatedCalories = useCountUp(totals.calories);
  const animatedRemaining = useCountUp(remaining);

  // Ring geometry
  const R = 92;
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
    setTimeout(() => setJustAdded(false), 900);
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

    if (!error && data) {
      setLogs((prev) => [data, ...prev]);
      pingAdded();
    }
    setSearchResults([]);
    setSearchQuery('');
  }

  async function removeLog(id: string) {
    setLogs((prev) => prev.filter((l) => l.id !== id));
    await supabase.from('logs').delete().eq('id', id);
  }

  if (loading) {
    return (
      <main className="aurora-page flex items-center justify-center">
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-orb-rainbow animate-spin-slow blur-[1px]" />
          <p className="font-cond text-white/60 tracking-[0.2em] text-xs">LOADING YOUR DAY…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="aurora-page">
      {/* Ambient gradient mesh background */}
      <div className="fixed inset-0 bg-aurora-mesh opacity-90 pointer-events-none" />
      <div className="fixed -top-40 -left-40 w-[420px] h-[420px] rounded-full bg-coral/20 blur-[110px] animate-glow-pulse pointer-events-none" />
      <div className="fixed -bottom-40 -right-24 w-[420px] h-[420px] rounded-full bg-indigo/25 blur-[110px] animate-glow-pulse pointer-events-none" style={{ animationDelay: '1.4s' }} />

      <div className="relative z-10 px-4 pb-32 pt-8 max-w-lg mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-7">
          <div>
            <p className="font-cond tracking-[0.35em] text-white/50 text-[11px]">TODAY</p>
            <h1 className="font-display text-2xl bg-clip-text text-transparent bg-orb-rainbow">Daily Value</h1>
          </div>
          <nav className="flex items-center gap-4 font-cond text-sm text-white/80">
            <Link href="/history" className="glass-pill px-3 py-1.5 rounded-full hover:text-white transition">
              History
            </Link>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = '/login';
              }}
              className="text-white/40 hover:text-white/70 transition"
            >
              Sign out
            </button>
          </nav>
        </header>

        {/* Hero: liquid gradient calorie ring */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="glass-card rounded-glass p-6 mb-5 flex flex-col items-center"
        >
          <div className="relative w-56 h-56 flex items-center justify-center animate-breathe">
            {/* soft rotating glow behind the ring */}
            <div className="absolute inset-[-14px] rounded-full bg-ring-rainbow blur-2xl opacity-40 animate-spin-slow" />
            <svg viewBox="0 0 200 200" className="relative w-full h-full -rotate-90">
              <defs>
                <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ff6b6b" />
                  <stop offset="20%" stopColor="#ffd15c" />
                  <stop offset="40%" stopColor="#4ade9a" />
                  <stop offset="60%" stopColor="#3fd0ff" />
                  <stop offset="80%" stopColor="#7c6bff" />
                  <stop offset="100%" stopColor="#ff5cb8" />
                </linearGradient>
              </defs>
              <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" />
              <circle
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke="url(#ringGradient)"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC * (1 - pct)}
                style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1)' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="font-cond tracking-[0.25em] text-white/45 text-[10px] mb-1">TODAY'S CALORIES</p>
              <p className="font-display text-4xl text-glow">{Math.round(animatedCalories)}</p>
              <p className="font-cond text-white/50 text-sm mt-0.5">/ {target || '—'} kcal</p>
              <p className="font-cond text-xs mt-2 px-3 py-1 rounded-full glass-pill text-white/70">
                {Math.round(animatedRemaining)} left
              </p>
            </div>
          </div>

          {/* Macro pills */}
          <div className="grid grid-cols-3 gap-3 w-full mt-6">
            {MACROS.map((m) => (
              <MacroPill
                key={m.key}
                label={m.label}
                value={totals[m.key]}
                target={(profile?.[m.targetKey] as number | undefined) ?? 0}
                from={m.from}
                to={m.to}
              />
            ))}
          </div>
        </motion.section>

        {/* Search a food */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="glass-card rounded-glass p-4 mb-5"
        >
          <button
            onClick={() => setSearchOpen((v) => !v)}
            className="w-full flex items-center justify-between font-cond font-semibold text-white"
          >
            <span>🔍 Search a food</span>
            <span className="text-white/40 text-sm">{searchOpen ? 'close' : 'open'}</span>
          </button>
          <AnimatePresence initial={false}>
            {searchOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="flex gap-2 mt-3">
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                    placeholder="e.g. banana"
                    className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/15 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
                  />
                  <button
                    onClick={runSearch}
                    className="px-4 py-2 rounded-xl font-cond font-semibold text-sm text-ink bg-orb-rainbow"
                  >
                    {searching ? '…' : 'Go'}
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <ul className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                    {searchResults.map((food) => (
                      <li key={food.fdcId} className="flex items-center justify-between text-sm gap-2 glass-pill rounded-xl px-3 py-2">
                        <span className="truncate flex-1 text-white/85">{food.name}</span>
                        <button
                          onClick={() => addSearchResult(food, 100)}
                          className="text-cyan whitespace-nowrap font-cond font-semibold"
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
        </motion.section>

        {/* Pending AI analysis confirmation */}
        <AnimatePresence>
          {pendingAnalysis && (
            <motion.section
              initial={{ opacity: 0, scale: 0.94, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className="glass-card rounded-glass p-5 mb-5 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-ring-rainbow opacity-[0.08] pointer-events-none" />
              <h3 className="font-display text-lg text-white relative">Confirm what the AI saw</h3>
              <p className="text-sm font-cond mt-1 text-white/60 relative">
                Confidence: {pendingAnalysis.accuracy}% · Health score: {pendingAnalysis.health_score}/10
              </p>
              <ul className="text-sm mb-2 mt-3 font-cond text-white/80 space-y-1 relative">
                {pendingAnalysis.foods.map((f, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-orb-rainbow" />
                    {f.name} (~{f.estimated_weight_g}g)
                  </li>
                ))}
              </ul>
              <p className="font-cond text-sm mb-3 text-white relative">
                {pendingAnalysis.total.calories} kcal · P{pendingAnalysis.total.protein}g · C
                {pendingAnalysis.total.carbs}g · F{pendingAnalysis.total.fat}g
              </p>
              <p className="text-sm italic mb-4 text-white/60 relative">{pendingAnalysis.recommendation}</p>
              <div className="flex gap-2 relative">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={confirmAnalysis}
                  className="flex-1 bg-orb-rainbow text-ink font-cond font-semibold py-2.5 rounded-xl"
                >
                  Add to log
                </motion.button>
                <button
                  onClick={() => setPendingAnalysis(null)}
                  className="px-4 glass-pill text-white/70 rounded-xl font-cond"
                >
                  Discard
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {analyzeError && (
          <div className="glass-card rounded-2xl px-4 py-3 mb-5 text-sm font-cond text-coral">{analyzeError}</div>
        )}

        {/* Today's entries */}
        <section>
          <h3 className="font-cond font-semibold text-lg mb-2 text-white/85">Logged today</h3>
          {logs.length === 0 && (
            <p className="text-white/40 text-sm font-cond">Nothing logged yet — tap the orb to add your first meal.</p>
          )}
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {logs.map((l) => (
                <motion.li
                  key={l.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85, filter: 'blur(6px)' }}
                  transition={{ duration: 0.35 }}
                  className="glass-card rounded-2xl p-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-orb-rainbow flex items-center justify-center text-lg shrink-0">
                      {l.source === 'ai_photo' ? '📸' : '🥗'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-cond font-semibold text-white truncate">{l.name}</p>
                      <p className="text-white/45 text-xs font-cond">
                        {Math.round(l.calories)} kcal · P{Math.round(l.protein_g)} C{Math.round(l.carbs_g)} F
                        {Math.round(l.fat_g)}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => removeLog(l.id)} className="text-white/30 hover:text-coral text-sm shrink-0 transition">
                    Remove
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      </div>

      {/* Hidden inputs used by the orb menu */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhoto}
        className="hidden"
      />
      <input ref={galleryInputRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />

      {/* Floating AI orb */}
      <div className="fixed bottom-6 right-6 z-20 flex flex-col items-end gap-3">
        <AnimatePresence>
          {orbOpen && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="glass-card rounded-2xl p-2 flex flex-col gap-1 min-w-[190px]"
            >
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="text-left px-3 py-2 rounded-xl text-sm font-cond text-white hover:bg-white/10 transition"
              >
                📷 Take Photo
              </button>
              <button
                onClick={() => galleryInputRef.current?.click()}
                className="text-left px-3 py-2 rounded-xl text-sm font-cond text-white hover:bg-white/10 transition"
              >
                🖼️ Choose from Gallery
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          onClick={() => setOrbOpen((v) => !v)}
          animate={{ y: orbOpen ? 0 : [0, -8, 0] }}
          transition={{ duration: 4.5, repeat: orbOpen ? 0 : Infinity, ease: 'easeInOut' }}
          whileTap={{ scale: 0.9 }}
          className="relative w-16 h-16 rounded-full bg-orb-rainbow flex items-center justify-center shadow-[0_0_40px_rgba(124,107,255,0.55)]"
        >
          <span className="absolute inset-0 rounded-full bg-orb-rainbow blur-xl opacity-70 animate-glow-pulse" />
          <motion.span
            animate={{ rotate: orbOpen ? 45 : 0 }}
            className="relative text-2xl text-ink font-bold"
          >
            {analyzing ? '✨' : '+'}
          </motion.span>
        </motion.button>
        {analyzing && (
          <p className="font-cond text-[11px] text-white/60 tracking-wide -mt-1">Scanning your meal…</p>
        )}
      </div>

      {/* Success ripple toast */}
      <AnimatePresence>
        {justAdded && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.9 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-30 glass-card rounded-full px-4 py-2 text-sm font-cond text-white"
          >
            ✨ Added to today's log
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
