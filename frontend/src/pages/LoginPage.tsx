import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, BarChart3, Boxes, Eye, EyeOff, Lock, Mail, ShieldCheck, Warehouse } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { ApiError, BACKEND, IS_STANDALONE } from '@/lib/api';
import { FirebaseGate } from './FirebaseSetup';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';

const schema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

// Demo accounts exist only in the server seed and the offline demo; Firebase uses real accounts.
const showDemo = import.meta.env.VITE_SHOW_DEMO_ACCOUNTS !== 'false' && BACKEND !== 'firebase';
const demoAccounts = [
  { role: 'Admin', email: 'admin@kaveridistributors.in', password: 'Admin@123' },
  { role: 'Manager', email: 'manager@kaveridistributors.in', password: 'Manager@123' },
  { role: 'Staff', email: 'staff@kaveridistributors.in', password: 'Staff@123' },
];

export function LoginPage() {
  const { status, login, sessionExpired } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<{ tone: 'error' | 'warning'; message: string } | null>(null);
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  if (status === 'authenticated') return <Navigate to={from} replace />;

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const user = await login(values.email, values.password);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}`, 'You are signed in to StockSense.');
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setServerError({ tone: 'warning', message: err.message });
      } else if (err instanceof ApiError) {
        setServerError({ tone: 'error', message: err.message });
      } else {
        setServerError({ tone: 'error', message: 'Unable to sign in right now. Please try again.' });
      }
    }
  };

  return (
    <div className="flex min-h-full bg-surface">
      {/* Brand panel */}
      <div className="relative hidden w-[46%] overflow-hidden bg-slate-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_40rem_at_-10%_-10%,rgba(99,102,241,0.35),transparent_60%),radial-gradient(40rem_30rem_at_110%_110%,rgba(16,185,129,0.18),transparent_60%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:44px_44px]" />
        <div className="relative flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-900/50">
            <Boxes className="size-6 text-white" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight text-white">StockSense</p>
            <p className="text-xs text-slate-400">Kaveri Distributors Pvt. Ltd.</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-white">
            Inventory clarity across every warehouse.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-400">
            Track stock in real time, move goods between Bengaluru, Mysuru and Mangaluru, and act on low-stock alerts before they become lost sales.
          </p>
          <ul className="mt-10 space-y-4">
            {[
              { icon: <Warehouse className="size-4" />, text: 'Multi-warehouse stock in, stock out & transfers' },
              { icon: <BarChart3 className="size-4" />, text: 'Live dashboard, valuation & low-stock reporting' },
              { icon: <ShieldCheck className="size-4" />, text: 'Role-based access with a complete audit trail' },
            ].map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-sm text-slate-300">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/[0.06] text-brand-300 ring-1 ring-white/10">{f.icon}</span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">Project NX-2026-014 · Secure enterprise inventory platform</p>
      </div>

      {/* Form */}
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700">
              <Boxes className="size-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-ink">StockSense</p>
              <p className="text-xs text-ink-3">Kaveri Distributors Pvt. Ltd.</p>
            </div>
          </div>

          <FirebaseGate>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h2>
          <p className="mt-1.5 text-sm text-ink-2">Use your company account to access the inventory console.</p>

          {sessionExpired && !serverError && (
            <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Your session has ended. Please sign in again.
            </div>
          )}

          {serverError && (
            <div
              role="alert"
              className={
                serverError.tone === 'warning'
                  ? 'mt-6 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
                  : 'mt-6 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
              }
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {serverError.message}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
            <Field label="Email address" htmlFor="email" error={errors.email?.message}>
              <Input id="email" type="email" autoComplete="username" placeholder="you@kaveridistributors.in" leading={<Mail className="size-4" />} invalid={!!errors.email} {...register('email')} />
            </Field>
            <Field label="Password" htmlFor="password" error={errors.password?.message}>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  leading={<Lock className="size-4" />}
                  invalid={!!errors.password}
                  className="pr-10"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-ink-3 hover:text-ink"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {showDemo && (
            <div className="mt-8 rounded-xl border border-dashed border-line-strong bg-surface-2 p-4">
              <p className="text-xs font-semibold tracking-wider text-ink-3 uppercase">Demo accounts</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {demoAccounts.map((a) => (
                  <button
                    key={a.role}
                    type="button"
                    onClick={() => {
                      setValue('email', a.email, { shouldValidate: true });
                      setValue('password', a.password, { shouldValidate: true });
                      setServerError(null);
                    }}
                    className="rounded-lg border border-line bg-surface px-2 py-2 text-xs font-medium text-ink-2 transition-colors hover:border-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
                  >
                    {a.role}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
                {IS_STANDALONE
                  ? 'Standalone demo edition: runs entirely in this browser with no server. Data is saved locally and can be reset from inside the app.'
                  : 'Click a role to fill its credentials, then sign in. Change these passwords before going live.'}
              </p>
            </div>
          )}
          </FirebaseGate>
        </div>
      </div>
    </div>
  );
}
