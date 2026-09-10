import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { auth, signOut } from "@/auth";
import { FilterForm } from "@/components/FilterForm";
import { IconButton } from "@/components/ui/Button";
import { LogoutIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

// Always sets a concrete data-theme (falling back to system preference, not
// just applying a stored override) before first paint — every dark: utility
// across the app is scoped to this attribute (see the @custom-variant in
// globals.css), so leaving it unset until ThemeToggle's own effect ran would
// flash the light theme on every load for anyone whose OS is set to dark.
const THEME_INIT_SCRIPT = `
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored === "dark" || stored === "light"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "only-me",
  description: "Manage Scenarios, Test Groups, and Test Cases",
  icons: { icon: "/logo.png" },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body>
        {/* Ambient backdrop: the same charcoal gradient and soft blooms the
            login page uses, so the app doesn't sit on a flat slab. Fixed and
            behind everything (`-z-10`), which works because it paints over
            body's own background colour rather than replacing it. Dark theme
            only — the same greys over the light palette read as dirt, not
            depth. `pointer-events-none` so it never eats a click. */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden dark:block"
        >
          <div className="absolute inset-0 bg-[linear-gradient(120deg,#050506_0%,#0c0d0f_28%,#181a1e_58%,#08090b_100%)]" />
          <div className="absolute -top-1/4 left-1/4 size-[52rem] rounded-full bg-zinc-300/[.07] blur-[120px]" />
          <div className="absolute -bottom-1/3 -left-1/4 size-[46rem] rounded-full bg-slate-400/[.07] blur-[130px]" />
          <div className="absolute -right-1/4 -bottom-1/4 size-[40rem] rounded-full bg-neutral-400/[.05] blur-[130px]" />
        </div>

        {session?.user && (
          <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur">
            <div className="flex w-full flex-wrap items-center gap-3 px-6 py-3 sm:px-8 lg:px-12 xl:px-16">
              <Link href="/projects" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                <Image src="/logo.png" alt="only-me" width={28} height={28} unoptimized />
                only-me
              </Link>

              <FilterForm action="/search" showClear={false} className="flex-1 min-w-48">
                <input
                  type="search"
                  name="q"
                  placeholder="Search Projects, Scenarios, Test Groups, Test Cases"
                  className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </FilterForm>

              <span className="text-sm text-muted">{session.user.email}</span>
              <ThemeToggle />
              <form action={logout}>
                <IconButton type="submit" aria-label="Log out" title="Log out">
                  <LogoutIcon />
                </IconButton>
              </form>
            </div>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
