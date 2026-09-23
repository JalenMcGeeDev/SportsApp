import { Brand } from "@/components/shared";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ confirm?: string; error?: string }> }) {
  const { confirm, error } = await searchParams;
  return (
    <main className="loading-screen">
      <Brand />
      <h1>Sign in to Season</h1>
      {confirm && <p className="form-note">Check your email to confirm your account, then sign in.</p>}
      {error && <p className="form-error">That confirmation link is invalid or expired.</p>}
      <LoginForm />
    </main>
  );
}
