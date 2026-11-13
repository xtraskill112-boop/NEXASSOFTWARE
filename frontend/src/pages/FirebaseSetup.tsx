import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, CheckCircle2, Cloud, Flame, RefreshCw, ShieldCheck } from 'lucide-react';
import { ApiError, apiRequest, BACKEND, errorMessage } from '@/lib/api';
import { clearFirebaseConfig, getFirebaseConfig, isConfigEditable, parseConfigSnippet, saveFirebaseConfig, usesEmulator } from '@/firebase/config';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { passwordRule } from './users/UserModals';

/**
 * Login-page gate for the Firebase edition:
 *  1. no Firebase project configured -> "Connect to Firebase"
 *  2. project has no administrator yet -> "Create the first administrator"
 *  3. otherwise -> the normal sign-in form (children)
 * In other editions it simply renders its children.
 */
export function FirebaseGate({ children }: { children: ReactNode }) {
  if (BACKEND !== 'firebase') return <>{children}</>;
  const config = getFirebaseConfig();
  if (!config) return <FirebaseConnect />;
  return <FirebaseStatus projectId={config.projectId} emulator={usesEmulator(config)}>{children}</FirebaseStatus>;
}

function changeProject() {
  clearFirebaseConfig();
  window.location.reload();
}

function FirebaseConnect() {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const connect = () => {
    try {
      const config = parseConfigSnippet(text);
      saveFirebaseConfig(config);
      window.location.reload();
    } catch (err) {
      setError(errorMessage(err, 'Could not read the Firebase configuration'));
    }
  };

  return (
    <div>
      <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
        <Flame className="size-6" />
      </div>
      <h2 className="text-2xl font-semibold tracking-tight text-ink">Connect to Firebase</h2>
      <p className="mt-1.5 text-sm text-ink-2">
        Paste your Firebase web app configuration. You can find it in the Firebase console under <strong className="text-ink">Project settings → General → Your apps</strong>.
      </p>
      <Field className="mt-6" label="Firebase configuration" htmlFor="fb-config" error={error ?? undefined} hint="The const firebaseConfig = { … } block or the equivalent JSON.">
        <Textarea
          id="fb-config"
          rows={9}
          className="font-mono text-xs"
          value={text}
          invalid={!!error}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder={'const firebaseConfig = {\n  apiKey: "AIza...",\n  authDomain: "your-project.firebaseapp.com",\n  projectId: "your-project",\n  appId: "1:...:web:..."\n};'}
        />
      </Field>
      <Button className="mt-4 w-full" size="lg" onClick={connect} disabled={!text.trim()} icon={<Cloud className="size-4" />}>
        Connect
      </Button>
      <p className="mt-4 text-xs leading-relaxed text-ink-3">
        The web configuration is not a secret; your data is protected by Firebase Authentication and the StockSense Firestore security rules. It is saved in this browser only.
      </p>
    </div>
  );
}

function FirebaseStatus({ projectId, emulator, children }: { projectId: string; emulator: boolean; children: ReactNode }) {
  const status = useQuery({
    queryKey: ['firebase', 'setup-status'],
    queryFn: () => apiRequest<{ needsAdmin: boolean; projectId: string }>('/setup/status', { skipAuthRedirect: true }),
    retry: false,
  });

  const footer = (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink-3">
      <span className="inline-flex items-center gap-1.5">
        <Flame className="size-3.5 text-amber-500" /> Firebase project <span className="font-mono text-ink-2">{projectId}</span>
        {emulator && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">emulator</span>}
      </span>
      {isConfigEditable() && (
        <button type="button" onClick={changeProject} className="font-medium text-brand-600 hover:underline dark:text-brand-400">
          Change project
        </button>
      )}
    </div>
  );

  if (status.isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-sm text-ink-3" role="status">
        <Spinner className="size-6 text-brand-500" /> Connecting to Firebase…
      </div>
    );
  }

  if (status.isError) {
    return (
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Cannot reach Firebase</h2>
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{errorMessage(status.error)}</span>
        </div>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>Check your internet connection.</li>
          <li>In the Firebase console, create a <strong>Cloud Firestore</strong> database and publish the StockSense security rules.</li>
          <li>Enable <strong>Email/Password</strong> under Authentication → Sign-in method.</li>
        </ul>
        <Button variant="secondary" className="mt-5" icon={<RefreshCw className="size-4" />} onClick={() => status.refetch()}>
          Try again
        </Button>
        {footer}
      </div>
    );
  }

  if (status.data?.needsAdmin) {
    return (
      <>
        <AdminSetup />
        {footer}
      </>
    );
  }

  return (
    <>
      {children}
      {footer}
    </>
  );
}

const adminSchema = z
  .object({
    name: z.string().trim().min(2, 'At least 2 characters').max(120),
    email: z.string().trim().email('Enter a valid email'),
    password: passwordRule,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: 'Passwords do not match', path: ['confirm'] });
type AdminValues = z.infer<typeof adminSchema>;

function AdminSetup() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AdminValues>({ resolver: zodResolver(adminSchema) });

  const onSubmit = async (v: AdminValues) => {
    setServerError(null);
    try {
      await apiRequest('/setup/admin', { method: 'POST', body: { name: v.name, email: v.email, password: v.password }, skipAuthRedirect: true });
      await login(v.email, v.password);
      toast.success('StockSense is ready', 'Your administrator account has been created.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) Object.entries(err.fieldErrors).forEach(([p, m]) => setError(p as keyof AdminValues, { message: m }));
      setServerError(errorMessage(err));
    }
  };

  return (
    <div>
      <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
        <ShieldCheck className="size-6" />
      </div>
      <h2 className="text-2xl font-semibold tracking-tight text-ink">Create the administrator</h2>
      <p className="mt-1.5 text-sm text-ink-2">
        <CheckCircle2 className="mr-1 inline size-4 text-[var(--status-good)]" />
        Connected to Firebase. This project has no users yet: the first account becomes the administrator, who can then add managers and staff.
      </p>
      {serverError && (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {serverError}
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <Field label="Full name" htmlFor="admin-name" error={errors.name?.message}>
          <Input id="admin-name" autoComplete="name" invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field label="Email address" htmlFor="admin-email" error={errors.email?.message}>
          <Input id="admin-email" type="email" autoComplete="username" invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="admin-password" error={errors.password?.message} hint="At least 8 characters with letters and numbers.">
          <Input id="admin-password" type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} />
        </Field>
        <Field label="Confirm password" htmlFor="admin-confirm" error={errors.confirm?.message}>
          <Input id="admin-confirm" type="password" autoComplete="new-password" invalid={!!errors.confirm} {...register('confirm')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Create administrator & sign in
        </Button>
      </form>
    </div>
  );
}
