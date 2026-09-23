import { Brand } from "@/components/shared";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <main className="loading-screen">
      <Brand />
      <h1>Create your organization</h1>
      <SignupForm />
    </main>
  );
}
