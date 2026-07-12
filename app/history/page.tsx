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
  accuracy: number | null;
  log_date: string;
  logged_at: string;
};

function useCountUp(value: number, duration = 1000) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const from = prev.current;
    const to = value || 0;
    if (from === to) return;
    const start = performance.now();
    const raf = requestAnimationFrame(function step(t) {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4); // quartOut
      setDisplay(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(step);
      else prev.current = to;
    });
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return display;
}

export default function ProfileHistoryPage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  // Settings Toggles
  const [notify, setNotify] = useState(true);
  const [privacy, setPrivacy] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(p);

      // Fetch last 30 days
      const since = new Date();
      since.setDate(since.getDate() - 30);

      const { data: l } = await supabase
        .from('logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('log_date', since.toISOString().slice(0, 10))
        .order('logged_at', { ascending: false });

      setLogs(l || []);
      setLoading(false);
    })();
  }, [supabase]);

  // Derived Data
  const stats = useMemo(() => {
    if (!logs.length) return { avgHealth: 0, streak: 0 };
    
    // Calculate streak
    const dates = [...new Set(logs.map(l => l.log_date))].sort((a, b) => b.localeCompare(a));
    let streak = 0;
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    
    let checkDate = new Date(dates[0] === today ? today : yesterday);
    for (const d of dates) {
      if (d === checkDate.toISOString().slice(0, 10)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (d !== today) {
        break;
      }
    }

    // Calculate avg health score
    const scoredLogs = logs.filter(l => l.health_score != null);
    const avgHealth = scoredLogs.length
      ? Math.round(scoredLogs.reduce((acc, l) => acc + (l.health_score || 0), 0) / scoredLogs.length)
      : 0;

    return { streak, avgHealth };
  }, [logs]);

  const timelineData = useMemo(() => {
    const grouped = logs.reduce((acc, log) => {
      if (!acc[log.log_date]) acc[log.log_date] = [];
      acc[log.log_date].push(log);
      return acc;
    }, {} as Record<string, LogEntry[]>);
    
    return Object.entries(grouped)
      .sort((a, b) => b[0].localeCompare(a[0])) // Newest first
      .map(([date, meals]) => ({
        date,
        meals,
        totalCals: meals.reduce((s, m) => s + m.calories, 0)
      }));
  }, [logs]);

  // Heatmap Data (Last 28 days for a 7x4 grid)
  const heatmap = useMemo(() => {
    const days = [];
    const target = profile?.target_calories || 2000;
    for (let i = 27; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const dayLogs = logs.filter(l => l.log_date === iso);
      const cals = dayLogs.reduce((s, l) => s + l.calories, 0);
      
      let status = 'empty';
      if (cals > 0) {
        if (cals <= target + 100 && cals >= target - 300) status = 'perfect';
        else if (cals > target + 100) status = 'over';
        else status = 'under';
      }
      days.push({ date: iso, status, cals });
    }
    return days;
  }, [logs, profile]);

  const animatedHealth = useCountUp(stats.avgHealth);
  const animatedStreak = useCountUp(stats.streak);

  async function generateInsight() {
    setInsightLoading(true);
    setInsight(null);
    try {
      const recentLogs = logs.slice(0, 30).map((r) => ({
        date: r.log_date,
        name: r.name,
        calories: r.calories,
        health_score: r.health_score
      }));
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, recentLogs }),
      });
      const data = await res.json();
      setInsight(data.insight || data.error || 'Your nutrition is perfectly balanced.');
    } catch {
      setInsight('The AI is resting. Try again in a moment.');
    } finally {
      setInsightLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F7FAF9] flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-teal-200 border-t-teal-500 animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#F7FAF9] selection:bg-teal-200 selection:text-teal-900 text-neutral-800 pb-32">
      {/* Layered Background: Turquoise -> Green */}
      <div className="fixed inset-0 -z-50 pointer-events-none">
        <motion.div 
          animate={{ scale: [1, 1.05, 1], rotate: [0, 5, 0] }}
          transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-10%] left-[-20%] w-[90vw] h-[90vw] rounded-full bg-gradient-to-br from-teal-300/20 to-emerald-200/10 blur-[120px]" 
        />
        <motion.div 
          animate={{ scale: [1, 1.1, 1], rotate: [0, -5, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[-20%] right-[-10%] w-[80vw] h-[80vw] rounded-full bg-gradient-to-tr from-emerald-300/20 to-green-200/20 blur-[100px]" 
        />
        <div className="absolute inset-0 opacity-[0.03] mix-blend-multiply bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZHRoPSI0IiBmaWxsPSIjMDAwIiBmaWxsLW9wYWNpdHk9Ii41Ii8+Cjwvc3ZnPg==')]" />
      </div>

      <div className="relative z-10 px-6 pt-12 max-w-lg mx-auto space-y-10">
        
        {/* Navigation & Header */}
        <header className="flex justify-between items-start">
          <Link href="/dashboard" className="w-10 h-10 flex items-center justify-center bg-white/50 backdrop-blur-md rounded-full shadow-sm border border-white/60 hover:scale-105 transition-transform text-teal-600">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </Link>
          <button onClick={handleSignOut} className="text-xs font-bold uppercase tracking-wider text-neutral-400 hover:text-red-500 transition-colors pt-2">
            Sign Out
          </button>
        </header>

        {/* Profile Card */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center"
        >
          <div className="relative w-28 h-28 mb-4">
            <div className="absolute inset-0 bg-gradient-to-tr from-teal-400 to-emerald-400 rounded-full animate-pulse blur-xl opacity-40" />
            <div className="relative w-full h-full bg-white backdrop-blur-xl rounded-full border-[4px] border-white shadow-lg flex items-center justify-center text-4xl font-light text-teal-600 overflow-hidden">
              {profile?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="absolute bottom-0 right-0 w-8 h-8 bg-emerald-100 border-2 border-white rounded-full flex items-center justify-center text-sm shadow-sm">
              ✨
            </div>
          </div>
          
          <h1 className="text-3xl font-semibold text-neutral-800 tracking-tight mb-1">
            {profile?.name || 'User'}
          </h1>
          <p className="text-sm font-medium text-emerald-600 bg-emerald-50 px-4 py-1.5 rounded-full border border-emerald-100">
            Current Goal: {profile?.target_calories} kcal
          </p>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4 w-full mt-8">
            <div className="bg-white/40 backdrop-blur-xl rounded-[24px] p-5 shadow-sm border border-white/60 flex flex-col items-center hover:-translate-y-1 transition-transform">
              <span className="text-3xl font-bold text-neutral-800 tabular-nums">{Math.round(animatedStreak)}</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mt-1">Day Streak</span>
            </div>
            <div className="bg-white/40 backdrop-blur-xl rounded-[24px] p-5 shadow-sm border border-white/60 flex flex-col items-center hover:-translate-y-1 transition-transform">
              <span className="text-3xl font-bold text-neutral-800 tabular-nums">{Math.round(animatedHealth)}</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mt-1">Avg Health Score</span>
            </div>
          </div>
        </motion.section>

        {/* AI Insight Section */}
        <section className="relative">
          <div className="absolute -inset-1 bg-gradient-to-r from-teal-400 to-emerald-400 rounded-[2rem] blur opacity-20" />
          <div className="relative bg-white/70 backdrop-blur-xl rounded-[2rem] p-6 shadow-sm border border-white/80">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-teal-600 flex items-center gap-2">
                <span className="text-lg">🧠</span> AI Coach
              </h3>
              <button 
                onClick={generateInsight}
                disabled={insightLoading || logs.length === 0}
                className="text-xs font-bold bg-teal-50 text-teal-700 px-3 py-1.5 rounded-full hover:bg-teal-100 transition-colors disabled:opacity-50"
              >
                {insightLoading ? 'Analyzing...' : 'Refresh'}
              </button>
            </div>
            <p className="text-base font-medium text-neutral-700 leading-relaxed italic">
              {insight || "Tap refresh to get a personalized breakdown of your recent eating patterns."}
            </p>
          </div>
        </section>

        {/* Eating Rhythm (Heatmap) */}
        <section className="bg-white/40 backdrop-blur-xl rounded-[2rem] p-6 shadow-sm border border-white/60">
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-4 text-center">Eating Rhythm</h3>
          <div className="grid grid-cols-7 gap-2">
            {heatmap.map((day, i) => {
              let bg = 'bg-neutral-200/50';
              let shadow = '';
              if (day.status === 'perfect') {
                bg = 'bg-emerald-400';
                shadow = 'shadow-[0_0_12px_rgba(52,211,153,0.6)]';
              } else if (day.status === 'over') {
                bg = 'bg-teal-300';
              } else if (day.status === 'under') {
                bg = 'bg-yellow-300';
              }

              return (
                <div key={i} className="group relative aspect-square">
                  <div className={`w-full h-full rounded-full ${bg} ${shadow} transition-all duration-300 transform group-hover:scale-125 border-2 border-white/50`} />
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-neutral-800 text-white text-[10px] font-bold py-1 px-2 rounded-lg whitespace-nowrap z-20">
                    {day.date.slice(5).replace('-', '/')} • {day.cals} kcal
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-center gap-4 mt-4 text-[10px] font-bold uppercase text-neutral-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400"></span> Perfect</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-300"></span> Over</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-300"></span> Under</span>
          </div>
        </section>

        {/* Meal History Timeline */}
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-6 px-2">Meal History</h3>
          
          {timelineData.length === 0 ? (
            <div className="text-center py-10 text-neutral-400 font-medium text-sm bg-white/30 rounded-[2rem] border border-white/50 border-dashed">
              No recent meals found.
            </div>
          ) : (
            <div className="relative pl-6">
              {/* Vertical River Line */}
              <div className="absolute left-[11px] top-2 bottom-4 w-1 rounded-full bg-gradient-to-b from-teal-300 via-emerald-300 to-transparent opacity-50" />
              
              <div className="space-y-8">
                {timelineData.map((day, idx) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    key={day.date} 
                    className="relative"
                  >
                    {/* Date Node */}
                    <div className="absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] z-10" />
                    
                    <div className="flex items-baseline justify-between mb-3">
                      <h4 className="text-sm font-bold text-neutral-700">
                        {new Date(day.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                      </h4>
                      <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-md">
                        {Math.round(day.totalCals)} kcal
                      </span>
                    </div>

                    <div className="space-y-3">
                      {day.meals.map(meal => (
                        <div key={meal.id} className="bg-white/60 backdrop-blur-md rounded-[20px] p-4 shadow-sm border border-white flex items-center justify-between group hover:bg-white/80 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-teal-100 to-emerald-100 flex items-center justify-center text-xl shrink-0 shadow-inner">
                              {meal.source === 'ai_photo' ? '✨' : '🥗'}
                            </div>
                            <div>
                              <p className="font-semibold text-neutral-800 text-sm">{meal.name}</p>
                              <div className="flex gap-2 items-center mt-0.5">
                                <span className="text-[11px] font-bold text-neutral-500">{meal.calories} kcal</span>
                                {meal.health_score && (
                                  <span className="text-[9px] font-bold uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md">
                                    Score: {meal.health_score}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          {meal.accuracy && (
                            <div className="text-[10px] font-bold text-teal-400/80 uppercase">
                              {meal.accuracy}% Match
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Settings */}
        <section className="bg-white/40 backdrop-blur-xl rounded-[2rem] p-6 shadow-sm border border-white/60 space-y-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">Settings</h3>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-neutral-800">Smart Notifications</p>
              <p className="text-xs text-neutral-500 mt-0.5">Friendly reminders & insights</p>
            </div>
            <button 
              onClick={() => setNotify(!notify)}
              className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-1 ${notify ? 'bg-emerald-400' : 'bg-neutral-300'}`}
            >
              <motion.div 
                layout 
                className="w-4 h-4 bg-white rounded-full shadow-sm"
                animate={{ x: notify ? 24 : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
          </div>

          <div className="h-px w-full bg-white/60" />

          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-neutral-800">Privacy Mode</p>
              <p className="text-xs text-neutral-500 mt-0.5">Hide precise weights in timeline</p>
            </div>
            <button 
              onClick={() => setPrivacy(!privacy)}
              className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-1 ${privacy ? 'bg-teal-400' : 'bg-neutral-300'}`}
            >
              <motion.div 
                layout 
                className="w-4 h-4 bg-white rounded-full shadow-sm"
                animate={{ x: privacy ? 24 : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
          </div>
          
          <div className="h-px w-full bg-white/60" />

          <button 
            onClick={handleSignOut}
            className="w-full py-4 rounded-2xl bg-white/50 text-red-500 font-bold hover:bg-red-50 hover:text-red-600 transition-colors border border-white"
          >
            Log Out Completely
          </button>
        </section>

      </div>
    </main>
  );
}
