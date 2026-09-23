"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup } from "../auth/actions";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, undefined);
  return (
    <form action={formAction} className="auth-card">
      {state?.error && <p className="form-error">{state.error}</p>}
      <label className="field">Organization name<input name="organizationName" required /></label>
      <label className="field">Your name<input name="ownerName" autoComplete="name" /></label>
      <label className="field">Email<input name="email" type="email" autoComplete="email" required /></label>
      <label className="field">Password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
      <button className="button primary" type="submit" disabled={pending}>{pending ? "Creating account..." : "Create organization"}</button>
      <p><Link href="/login">Already have an account? Sign in</Link></p>
    </form>
  );
}
