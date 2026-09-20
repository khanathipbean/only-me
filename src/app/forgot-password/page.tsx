import Link from "next/link";
import { redirect } from "next/navigation";
import { ProfileValidationError, resetPasswordByEmail } from "@/lib/users";
import { withToast } from "@/lib/toast";
import { SubmitButton } from "@/components/SubmitButton";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { invalidateRouteCache } from "@/lib/revalidate";

/**
 * Same glass-on-dark shell as `/login` — this page floats on the same dark
 * background, so its fields follow that page's own styling rather than the
 * theme-aware `inputClass`/`labelClass` (which would go near-black here).
 */
const GLASS_FIELD =
  "rounded-md border border-white/15 bg-white/10 text-white shadow-sm outline-none transition-colors placeholder:text-white/40 focus:border-white/45 focus:bg-white/15 focus:ring-1 focus:ring-white/40";
const glassInputClass = `block w-full ${GLASS_FIELD} px-4 py-3 text-base`;
const glassPasswordClass = `block w-full ${GLASS_FIELD} py-3 pr-11 pl-4 text-base`;
const glassLabelClass = "flex flex-col gap-2 text-sm font-medium text-white/90";
const glassToggleClass = "text-white/50 hover:text-white focus-visible:ring-white/50";

export const metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function resetPassword(formData: FormData) {
    "use server";
    invalidateRouteCache();

    const email = formData.get("email") as string;
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (newPassword !== confirmPassword) {
      redirect(`/forgot-password?error=${encodeURIComponent("Passwords don't match")}`);
    }

    try {
      await resetPasswordByEmail(email, newPassword);
    } catch (err) {
      if (err instanceof ProfileValidationError) {
        redirect(`/forgot-password?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    redirect(withToast("/login", "Password updated — sign in with your new password"));
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050506]">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,#050506_0%,#0c0d0f_28%,#181a1e_58%,#08090b_100%)]" />
      <div className="absolute -top-1/4 left-1/4 size-[52rem] rounded-full bg-zinc-300/10 blur-[120px]" />
      <div className="absolute -bottom-1/3 -left-1/4 size-[46rem] rounded-full bg-slate-400/10 blur-[130px]" />

      <div className="relative w-full max-w-md rounded-3xl border border-white/20 bg-white/10 p-10 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.75)] ring-1 ring-white/5 backdrop-blur-2xl">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Reset your password</h1>
          <p className="mt-1.5 text-sm text-white/60">
            Enter the email on your account and choose a new password.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-md border border-red-400/30 bg-red-500/15 px-3 py-2 text-sm text-red-200"
          >
            {error}
          </p>
        )}

        <form action={resetPassword} className="mt-8 flex flex-col gap-5">
          <label className={glassLabelClass}>
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className={glassInputClass}
            />
          </label>
          <label className={glassLabelClass}>
            New password
            <PasswordInput
              name="newPassword"
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
              inputClassName={glassPasswordClass}
              toggleClassName={glassToggleClass}
            />
          </label>
          <label className={glassLabelClass}>
            Confirm new password
            <PasswordInput
              name="confirmPassword"
              required
              autoComplete="new-password"
              placeholder="Re-enter the new password"
              inputClassName={glassPasswordClass}
              toggleClassName={glassToggleClass}
            />
          </label>
          <SubmitButton size="lg" className="mt-2 w-full" pendingLabel="Updating…">
            Reset password
          </SubmitButton>
        </form>

        <p className="mt-6 text-center text-sm text-white/60">
          <Link href="/login" className="text-white/80 hover:text-white">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
