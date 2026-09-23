"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "../auth/actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, undefined);
  return (
    <form action={formAction} className="auth-card">
      {state?.error && <p className="form-error">{state.error}</p>}
      <label className="field">Email<input name="email" type="email" autoComplete="email" required /></label>
      <label className="field">Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <button className="button primary" type="submit" disabled={pending}>{pending ? "Signing in..." : "Sign in"}</button>
      <p><Link href="/signup">Create an organization instead</Link></p>
    </form>
  );
}
