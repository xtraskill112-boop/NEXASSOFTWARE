import { useState, type FormEvent } from "react";
import { sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { MailCheck, ShieldX } from "lucide-react";
import { auth } from "../firebase";
import { useAuth } from "../auth";
import { Alert, Button, TextInput } from "../components/ui";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-line">
        <p className="text-lg font-semibold text-ink">SF360 Seller Dashboard</p>
        <p className="mb-5 text-sm text-ink-3">Private — for the account owner only.</p>
        {children}
      </div>
    </div>
  );
}

function authMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Wrong e-mail or password.";
      case "auth/too-many-requests":
        return "Too many attempts. Wait a few minutes or reset your password.";
      case "auth/network-request-failed":
        return "No internet connection.";
      default:
        return err.message;
    }
  }
  return String(err);
}

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!email.trim()) return setError("Type your e-mail first, then tap “Forgot password”.");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo("If this e-mail has an account, a reset link is on its way.");
      setError(null);
    } catch (err) {
      setError(authMessage(err));
    }
  };

  return (
    <Shell>
      <form onSubmit={submit} className="space-y-3">
        <TextInput label="E-mail" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <TextInput label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <Alert tone="critical">{error}</Alert>}
        {info && <Alert tone="good">{info}</Alert>}
        <Button type="submit" variant="primary" loading={busy} className="w-full">
          Log in
        </Button>
        <button type="button" onClick={() => void reset()} className="w-full text-center text-sm text-brand hover:underline">
          Forgot password
        </button>
      </form>
    </Shell>
  );
}

export function VerifyEmailPage() {
  const { state, recheck, logout } = useAuth();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const user = state.phase === "unverified" ? state.user : null;
  return (
    <Shell>
      <div className="space-y-3 text-sm text-ink-2">
        <MailCheck className="size-8 text-brand" aria-hidden />
        <p>
          For safety, the dashboard only opens for a verified e-mail. Send a verification link to <b>{user?.email}</b>, open it, then come back
          and tap “I have verified”.
        </p>
        {error && <Alert tone="critical">{error}</Alert>}
        {sent && <Alert tone="good">Link sent. Check your inbox (and spam folder).</Alert>}
        <Button
          variant="primary"
          className="w-full"
          disabled={!user}
          onClick={async () => {
            try {
              if (user) await sendEmailVerification(user);
              setSent(true);
            } catch (err) {
              setError(authMessage(err));
            }
          }}
        >
          Send verification link
        </Button>
        <Button
          className="w-full"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await recheck().finally(() => setBusy(false));
          }}
        >
          I have verified
        </Button>
        <button type="button" onClick={() => void logout()} className="w-full text-center text-sm text-ink-3 hover:underline">
          Use another account
        </button>
      </div>
    </Shell>
  );
}

export function DeniedPage({ message }: { message: string }) {
  const { logout } = useAuth();
  return (
    <Shell>
      <div className="space-y-3 text-sm text-ink-2">
        <ShieldX className="size-8 text-critical" aria-hidden />
        <p className="font-medium text-ink">This account cannot use the dashboard.</p>
        <p>{message}</p>
        <Button className="w-full" onClick={() => void logout()}>
          Log out
        </Button>
      </div>
    </Shell>
  );
}

export function ErrorPage({ message }: { message: string }) {
  const { recheck, logout } = useAuth();
  return (
    <Shell>
      <div className="space-y-3 text-sm">
        <Alert tone="critical" title="Could not connect">
          {message}
        </Alert>
        <Button variant="primary" className="w-full" onClick={() => void recheck()}>
          Try again
        </Button>
        <Button className="w-full" onClick={() => void logout()}>
          Log out
        </Button>
      </div>
    </Shell>
  );
}
