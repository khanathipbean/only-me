import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  MIN_PASSWORD_LENGTH,
  ProfileValidationError,
  changePassword,
  getUserById,
  updateDisplayName,
} from "@/lib/users";
import { Breadcrumb } from "@/components/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { inputClass, labelClass, mutedTextClass, pageClass } from "@/lib/ui";

export const metadata = { title: "Profile" };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ nameError?: string; passwordError?: string; saved?: string }>;
}) {
  const { nameError, passwordError, saved } = await searchParams;
  const session = await auth();
  const user = await getUserById(session!.user.id);
  if (!user) {
    redirect("/login");
  }

  async function saveName(formData: FormData) {
    "use server";
    const session = await auth();
    try {
      await updateDisplayName(session!.user.id, formData.get("name") as string);
    } catch (err) {
      if (err instanceof ProfileValidationError) {
        redirect(`/profile?nameError=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }
    redirect("/profile?saved=name");
  }

  async function savePassword(formData: FormData) {
    "use server";
    const session = await auth();
    const next = formData.get("newPassword") as string;
    if (next !== (formData.get("confirmPassword") as string)) {
      redirect(`/profile?passwordError=${encodeURIComponent("The two new passwords don't match")}`);
    }
    try {
      await changePassword(session!.user.id, formData.get("currentPassword") as string, next);
    } catch (err) {
      if (err instanceof ProfileValidationError) {
        redirect(`/profile?passwordError=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }
    redirect("/profile?saved=password");
  }

  return (
    <main className={pageClass}>
      <Breadcrumb segments={[{ label: "Profile", href: "/profile" }]} />
      <PageHeader title="Profile" subtitle={user.email} />

      {/* Side by side at lg: and up — two max-w-xl cards stacked in a
          full-width column left most of a desktop viewport empty below them. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Display name</h2>
            <p className={mutedTextClass}>The name shown on your avatar and beside your activity.</p>
          </div>

          {nameError && (
            <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {nameError}
            </p>
          )}
          {saved === "name" && (
            <p role="status" className="rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              Display name updated.
            </p>
          )}

          <form action={saveName} className="flex flex-col gap-4">
            <label className={labelClass}>
              <span>
                Display name
                <RequiredMark />
              </span>
              <input name="name" defaultValue={user.name} required className={inputClass} />
            </label>
            <div className="flex justify-end">
              <Button type="submit">Save name</Button>
            </div>
          </form>
        </Card>

        <Card className="flex flex-col gap-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Change password</h2>
            <p className={mutedTextClass}>
              Your current password is required — it stops anyone who finds this machine signed in
              from taking the account over.
            </p>
          </div>

          {passwordError && (
            <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {passwordError}
            </p>
          )}
          {saved === "password" && (
            <p role="status" className="rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              Password changed.
            </p>
          )}

          <form action={savePassword} className="flex flex-col gap-4">
            <label className={labelClass}>
              <span>
                Current password
                <RequiredMark />
              </span>
              <PasswordInput name="currentPassword" required autoComplete="current-password" />
            </label>
            <label className={labelClass}>
              <span>
                New password
                <RequiredMark />
              </span>
              <PasswordInput
                name="newPassword"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              />
            </label>
            <label className={labelClass}>
              <span>
                Confirm new password
                <RequiredMark />
              </span>
              <PasswordInput name="confirmPassword" required autoComplete="new-password" />
            </label>
            <div className="flex justify-end">
              <Button type="submit">Change password</Button>
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}
