import Link from "next/link";

/**
 * There is no self-serve password reset, and this page says so.
 *
 * It used to take an email address and a new password and apply them, from a
 * page that sits outside authentication — so anyone who knew an address could
 * take that account, the one that administers every project included, and
 * nothing was ever sent to the owner to say it had happened. The page is kept
 * rather than removed because `/forgot-password` is linked from sign-in and
 * is where somebody locked out will go; what it must not keep is a form that
 * changes a password for whoever fills it in.
 *
 * An emailed one-time link is the usual answer and cannot be built here yet:
 * the app has no way to send mail at all, so a token would have to be read out
 * of the database by the very person it is meant to authenticate. Until there
 * is a mailer, an administrator sets the password from Members — the same
 * person who creates accounts in the first place.
 */
export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050506]">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,#050506_0%,#0c0d0f_28%,#181a1e_58%,#08090b_100%)]" />
      <div className="absolute -top-1/4 left-1/4 size-[52rem] rounded-full bg-zinc-300/10 blur-[120px]" />
      <div className="absolute -bottom-1/3 -left-1/4 size-[46rem] rounded-full bg-slate-400/10 blur-[130px]" />

      <div className="relative w-full max-w-md rounded-3xl border border-white/20 bg-white/10 p-10 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.75)] ring-1 ring-white/5 backdrop-blur-2xl">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Ask an administrator
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            Passwords are set by whoever administers your projects. Ask them to set a new one
            for you, then sign in and change it from your profile.
          </p>
        </div>

        <p className="mt-8 text-center text-sm text-white/60">
          <Link href="/login" className="text-white/80 hover:text-white">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
