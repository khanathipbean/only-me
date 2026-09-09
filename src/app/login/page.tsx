import { AuthError } from "next-auth";
import Image from "next/image";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { inputClass, labelClass } from "@/lib/ui";

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
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <Image src="/logo.png" alt="only-me" width={72} height={72} unoptimized />
          <h1 className="text-xl font-semibold tracking-tight text-foreground">only-me</h1>
          <p className="text-sm text-muted">Log in to continue</p>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300">
            Invalid email or password.
          </p>
        )}

        <form action={login} className="mt-6 flex flex-col gap-4">
          <label className={labelClass}>
            Email
            <input name="email" type="email" required className={inputClass} />
          </label>
          <label className={labelClass}>
            Password
            <input name="password" type="password" required className={inputClass} />
          </label>
          <Button type="submit" className="mt-2 w-full">
            Log in
          </Button>
        </form>
      </Card>
    </main>
  );
}
