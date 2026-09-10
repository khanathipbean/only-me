import { AuthError } from "next-auth";
import Image from "next/image";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";

/**
 * The out-of-focus words drifting behind the brand panel. Purely decorative —
 * the panel that holds them is `aria-hidden`, so they're never announced.
 *
 * Size, blur and opacity move together on purpose: the big words are sharper
 * and brighter, the small ones blurrier and fainter, so the set reads as
 * depth rather than as one flat layer of text at random sizes.
 *
 * Each entry carries complete class strings rather than interpolated ones, so
 * Tailwind's scanner can see every arbitrary value it needs to emit.
 */
const GHOST_WORDS = [
  // Foreground — large, nearly sharp
  { text: "Requirement", className: "top-[2%] -left-[5%] rotate-[-9deg] text-[8rem] blur-[2px] text-white/[.11]" },
  { text: "Tester", className: "top-[26%] left-[28%] rotate-[12deg] text-[9rem] blur-[3px] text-white/[.10]" },
  { text: "Test Case", className: "top-[52%] -left-[6%] rotate-[-6deg] text-[7rem] blur-[2px] text-white/[.11]" },
  { text: "Test Group", className: "top-[76%] left-[32%] rotate-[8deg] text-[7.5rem] blur-[3px] text-white/[.09]" },
  { text: "Scenario", className: "top-[88%] left-[66%] rotate-[-5deg] text-[6.5rem] blur-[3px] text-white/[.09]" },
  // Middle distance
  { text: "Coverage", className: "top-[8%] left-[36%] rotate-[5deg] text-[4.5rem] blur-[4px] text-white/[.09]" },
  { text: "Test Plan", className: "top-[14%] left-[58%] rotate-[-3deg] text-[5rem] blur-[4px] text-white/[.09]" },
  { text: "Defect", className: "top-[34%] left-[6%] rotate-[4deg] text-[5rem] blur-[4px] text-white/[.08]" },
  { text: "Regression", className: "top-[40%] left-[62%] rotate-[7deg] text-[5.5rem] blur-[5px] text-white/[.08]" },
  { text: "Test Step", className: "top-[64%] left-[18%] rotate-[-11deg] text-[4rem] blur-[5px] text-white/[.08]" },
  { text: "Test Suite", className: "top-[70%] left-[70%] rotate-[10deg] text-[4rem] blur-[5px] text-white/[.08]" },
  // Far back — small, softest, faintest
  { text: "Automation", className: "top-[6%] left-[74%] rotate-[11deg] text-[2.75rem] blur-[7px] text-white/[.06]" },
  { text: "Expected Result", className: "top-[20%] left-[12%] rotate-[-6deg] text-[3rem] blur-[6px] text-white/[.07]" },
  { text: "Boundary", className: "top-[30%] left-[76%] rotate-[-8deg] text-[3.25rem] blur-[6px] text-white/[.07]" },
  { text: "Precondition", className: "top-[46%] left-[36%] rotate-[9deg] text-[2.5rem] blur-[7px] text-white/[.07]" },
  { text: "Test Data", className: "top-[58%] left-[54%] rotate-[-4deg] text-[3rem] blur-[6px] text-white/[.07]" },
  { text: "Edge Case", className: "top-[82%] left-[8%] rotate-[6deg] text-[2.75rem] blur-[7px] text-white/[.06]" },
  { text: "Traceability", className: "top-[94%] left-[44%] rotate-[3deg] text-[2.5rem] blur-[8px] text-white/[.06]" },
];

/**
 * The card floats on artwork that is always dark, so everything inside it is
 * styled light-on-dark for good and doesn't follow the light/dark theme — a
 * themed `text-foreground` would turn near-black over the purple gradient and
 * disappear. These mirror the shapes of `inputClass` / `labelClass` rather
 * than extending them, since appending a second `bg-*` or `text-*` to those
 * wouldn't reliably win (Tailwind's emit order decides, not the write order).
 */
const GLASS_FIELD =
  "rounded-md border border-white/15 bg-white/10 text-white shadow-sm outline-none transition-colors placeholder:text-white/40 focus:border-white/45 focus:bg-white/15 focus:ring-1 focus:ring-white/40";
const glassInputClass = `block w-full ${GLASS_FIELD} px-4 py-3 text-base`;
const glassPasswordClass = `block w-full ${GLASS_FIELD} py-3 pr-11 pl-4 text-base`;
const glassLabelClass = "flex flex-col gap-2 text-sm font-medium text-white/90";
const glassToggleClass = "text-white/50 hover:text-white focus-visible:ring-white/50";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function login(formData: FormData) {
    "use server";

    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/projects",
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect("/login?error=CredentialsSignin");
      }
      throw err;
    }
  }

  return (
    /* The artwork now fills the viewport instead of sitting in a left-hand
       column, so there's no solid panel behind the form — it floats on the
       gradient inside a translucent card. That card still uses the theme's
       surface token, which is what keeps every token-based control inside it
       (inputs, labels, the button) readable in both light and dark mode. */
    <main className="relative flex min-h-screen items-center overflow-hidden bg-[#050506]">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,#050506_0%,#0c0d0f_28%,#181a1e_58%,#08090b_100%)]" />
      {/* Two soft blooms give the flat gradient the depth the reference has. */}
      <div className="absolute -top-1/4 left-1/4 size-[52rem] rounded-full bg-zinc-300/10 blur-[120px]" />
      <div className="absolute -bottom-1/3 -left-1/4 size-[46rem] rounded-full bg-slate-400/10 blur-[130px]" />
      <div className="absolute -right-1/4 -bottom-1/4 size-[40rem] rounded-full bg-neutral-400/8 blur-[130px]" />

      <div aria-hidden="true" className="absolute inset-0 overflow-hidden select-none">
        {GHOST_WORDS.map((word) => (
          <span
            key={word.text}
            className={`absolute font-bold tracking-tight whitespace-nowrap ${word.className}`}
          >
            {word.text}
          </span>
        ))}
      </div>

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.15fr_1fr] lg:gap-10 lg:px-12">
        <div className="hidden lg:block">
          <h2 className="text-5xl leading-tight font-bold text-balance text-white xl:text-6xl">
            Test management,
            <br />
            end to end
          </h2>
          <p className="mt-4 max-w-xl text-base text-pretty text-white/70 italic">
            Requirements, Scenarios, Test Groups and Test Cases — in one place.
          </p>
        </div>

        <div className="flex justify-center">
          <div className="w-full max-w-md rounded-3xl border border-white/20 bg-white/10 p-10 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.75)] ring-1 ring-white/5 backdrop-blur-2xl">
            <div className="flex flex-col items-center gap-3 text-center">
              <Image src="/logo.png" alt="only-me" width={80} height={80} unoptimized />
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white">only-me</h1>
                <p className="mt-1.5 text-sm text-white/60">
                  Manage Scenarios, Test Groups and Test Cases
                </p>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-6 rounded-md border border-red-400/30 bg-red-500/15 px-3 py-2 text-sm text-red-200"
              >
                Invalid email or password.
              </p>
            )}

            <form action={login} className="mt-8 flex flex-col gap-5">
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
                Password
                <PasswordInput
                  name="password"
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  inputClassName={glassPasswordClass}
                  toggleClassName={glassToggleClass}
                />
              </label>
              <Button type="submit" size="lg" className="mt-2 w-full">
                Sign in
              </Button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
