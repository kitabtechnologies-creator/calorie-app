'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) return setError(error.message);
      setNotice('Account created. Check your inbox to confirm, then sign in.');
      setMode('signin');
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/');
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-cond tracking-[0.3em] text-citrus text-xs mb-1">SERVING SIZE: 1 DAY</p>
          <h1 className="font-display text-3xl leading-tight">DAILY VALUE</h1>
          <p className="text-muted text-sm mt-2">Know exactly what's on your plate.</p>
        </div>

        <div className="nutri-label">
          <div className="thick" />
          <h2 className="font-display text-xl">{mode === 'signin' ? 'Sign In' : 'Create Account'}</h2>
          <div className="med" />

          <form onSubmit={handleSubmit} className="space-y-3 font-body">
            <div>
              <label className="text-xs uppercase tracking-wide font-semibold">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-ink bg-white text-ink rounded-sm"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide font-semibold">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-ink bg-white text-ink rounded-sm"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-fat text-sm font-semibold">{error}</p>}
            {notice && <p className="text-protein text-sm font-semibold">{notice}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-ink text-paper font-display text-sm py-3 rounded-sm mt-2 disabled:opacity-60"
            >
              {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <div className="thin" />
          <button
            className="text-xs font-cond underline mt-2"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
              setNotice(null);
            }}
          >
            {mode === 'signin' ? "New here? Create an account" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </main>
  );
}
