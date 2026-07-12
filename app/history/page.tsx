'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { createClient } from '@/lib/supabase/client';

type Range = 7 | 30 | 90;

export default function HistoryPage() {
  const supabase = createClient();
  const [range, setRange] = useState<Range>(7);
  const [rows, setRows] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(p);

      const since = new Date();
      since.setDate(since.getDate() - range);

      const { data: logs } = await supabase
        .from('logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('log_date', since.toISOString().slice(0, 10))
        .order('log_date', { ascending: true });

      setRows(logs || []);
      setLoading(false);
    })();
  }, [range]);

  const chartData = useMemo(() => {
    const byDate = new Map<string, { date: string; calories: number; protein: number; carbs: number; fat: number }>();
    for (const r of rows) {
      const key = r.log_date;
      const entry = byDate.get(key) || { date: key, calories: 0, protein: 0, carbs: 0, fat: 0 };
      entry.calories += Number(r.calories);
      entry.protein += Number(r.protein_g);
      entry.carbs += Number(r.carbs_g);
      entry.fat += Number(r.fat_g);
      byDate.set(key, entry);
    }
    return Array.from(byDate.values()).map((d) => ({
      ...d,
      date: d.date.slice(5), // MM-DD
    }));
  }, [rows]);

  const avgCalories = chartData.length
    ? Math.round(chartData.reduce((s, d) => s + d.calories, 0) / chartData.length)
    : 0;

  async function getInsight() {
    setInsightLoading(true);
    setInsight(null);
    const recentLogs = rows.slice(-30).map((r) => ({
      date: r.log_date,
      name: r.name,
      calories: r.calories,
      protein_g: r.protein_g,
      carbs_g: r.carbs_g,
      fat_g: r.fat_g,
    }));
    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, recentLogs }),
      });
      const data = await res.json();
      setInsight(data.insight || data.error || 'No insight available yet.');
    } catch {
      setInsight('Could not reach the coach right now — try again shortly.');
    } finally {
      setInsightLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-8 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <p className="font-cond tracking-[0.3em] text-citrus text-xs">TRENDS</p>
          <h1 className="font-display text-2xl">History</h1>
        </div>
        <Link href="/dashboard" className="font-cond text-sm underline underline-offset-4">
          Back to today
        </Link>
      </header>

      <div className="flex gap-2 mb-4">
        {[7, 30, 90].map((r) => (
          <button
            key={r}
            onClick={() => setRange(r as Range)}
            className={`px-3 py-1.5 rounded-full font-cond text-sm border border-line ${
              range === r ? 'bg-citrus text-ink' : 'text-muted'
            }`}
          >
            {r === 7 ? 'Week' : r === 30 ? 'Month' : '3 Months'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : chartData.length === 0 ? (
        <p className="text-muted">No logs in this range yet.</p>
      ) : (
        <>
          <section className="bg-panel border border-line rounded-card p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-cond font-semibold">Calories per day</h2>
              <span className="text-sm text-muted font-cond">
                avg {avgCalories} kcal {profile ? `· target ${profile.target_calories}` : ''}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={chartData}>
                <CartesianGrid stroke="#22272f" />
                <XAxis dataKey="date" stroke="#8b93a1" fontSize={12} />
                <YAxis stroke="#8b93a1" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: '#171b21', border: '1px solid #22272f', fontSize: 12 }}
                />
                <Bar dataKey="calories" fill="#c7e05a" radius={[4, 4, 0, 0]} />
                {profile && (
                  <Line
                    type="monotone"
                    dataKey={() => profile.target_calories}
                    stroke="#c76a5a"
                    dot={false}
                    strokeDasharray="4 4"
                    name="target"
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </section>

          <section className="bg-panel border border-line rounded-card p-4 mb-6">
            <h2 className="font-cond font-semibold mb-3">Macros per day (g)</h2>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={chartData}>
                <CartesianGrid stroke="#22272f" />
                <XAxis dataKey="date" stroke="#8b93a1" fontSize={12} />
                <YAxis stroke="#8b93a1" fontSize={12} />
                <Tooltip contentStyle={{ background: '#171b21', border: '1px solid #22272f', fontSize: 12 }} />
                <Legend />
                <Line type="monotone" dataKey="protein" stroke="#5b8fc9" name="Protein" />
                <Line type="monotone" dataKey="carbs" stroke="#e6a83e" name="Carbs" />
                <Line type="monotone" dataKey="fat" stroke="#c76a5a" name="Fat" />
              </ComposedChart>
            </ResponsiveContainer>
          </section>
        </>
      )}

      <section className="nutri-label">
        <div className="thick" />
        <div className="row">
          <h2 className="font-display text-lg">Coach's Notes</h2>
          <button
            onClick={getInsight}
            disabled={insightLoading || rows.length === 0}
            className="text-sm font-cond font-semibold bg-ink text-paper px-3 py-1.5 rounded-sm disabled:opacity-50"
          >
            {insightLoading ? 'Thinking…' : 'Get insight'}
          </button>
        </div>
        <div className="thin" />
        <p className="text-sm font-body">
          {insight ?? 'Get a quick read on your recent patterns and one thing to try next.'}
        </p>
      </section>
    </main>
  );
}
