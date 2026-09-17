import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  MAX_AVATAR_BYTES,
  MIN_PASSWORD_LENGTH,
  ProfileValidationError,
  changePassword,
  getUserById,
  removeAvatar,
  updateAvatar,
  updateDisplayName,
} from "@/lib/users";
import { Breadcrumb } from "@/components/Breadcrumb";
import { profileBreadcrumb } from "@/lib/breadcrumb";
import { withToast } from "@/lib/toast";
import { DismissibleAlert } from "@/components/DismissibleAlert";
import { ConfirmForm } from "@/components/ConfirmForm";
import { Avatar } from "@/components/ui/Avatar";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { SubmitButton } from "@/components/SubmitButton";
import { IconButton } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { TrashIcon } from "@/components/icons";
import { inputClass, labelClass, mutedTextClass, pageClass } from "@/lib/ui";
import { invalidateRouteCache } from "@/lib/revalidate";

export const metadata = { title: "Profile" };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ nameError?: string; passwordError?: string; avatarError?: string }>;
}) {
  const { nameError, passwordError, avatarError } = await searchParams;
  const session = await auth();
  const user = await getUserById(session!.user.id);
  if (!user) {
    redirect("/login");
  }

  async function saveName(formData: FormData) {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    try {
      await updateDisplayName(session!.user.id, formData.get("name") as string);
    } catch (err) {
      if (err instanceof ProfileValidationError) {
        redirect(`/profile?nameError=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }
    redirect(withToast("/profile", "Display name updated"));
  }

  async function savePassword(formData: FormData) {
    "use server";
    invalidateRouteCache();
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
    redirect(withToast("/profile", "Password changed"));
  }

  async function uploadAvatar(formData: FormData) {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    const file = formData.get("avatar");
    if (!(file instanceof File) || file.size === 0) {
      redirect(`/profile?avatarError=${encodeURIComponent("Choose a picture first")}`);
    }
    try {
      await updateAvatar(session!.user.id, file);
    } catch (err) {
      if (err instanceof ProfileValidationError) {
        redirect(`/profile?avatarError=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }
    redirect(withToast("/profile", "Profile picture updated"));
  }

  async function removeAvatarAction() {
    "use server";
    invalidateRouteCache();
    const session = await auth();
    await removeAvatar(session!.user.id);
    redirect(withToast("/profile", "Profile picture removed"));
  }

  return (
    <main className={pageClass}>
      <Breadcrumb segments={profileBreadcrumb()} />
      <PageHeader title="Profile" subtitle={user.email} />

      <Card className="flex flex-col gap-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Profile picture</h2>
          <p className={mutedTextClass}>
            Shown wherever your name appears. PNG, JPEG, WEBP, or GIF, up to{" "}
            {Math.round(MAX_AVATAR_BYTES / 1024 / 1024)} MB.
          </p>
        </div>

        {avatarError && (
          <DismissibleAlert clearParams={["avatarError"]}>{avatarError}</DismissibleAlert>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <Avatar
            name={user.name}
            src={user.avatarKey ? `/api/users/${user.id}/avatar` : null}
            size="size-16"
          />
          <form action={uploadAvatar} className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              name="avatar"
              accept="image/png,image/jpeg,image/webp,image/gif"
              required
              aria-label="Profile picture"
              className="block text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-foreground file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-background"
            />
            <SubmitButton pendingLabel="Uploading…">Upload</SubmitButton>
          </form>
          {user.avatarKey && (
            <ConfirmForm
              action={removeAvatarAction}
              confirmMessage="Remove your profile picture?"
              variant="danger"
            >
              <IconButton
                type="submit"
                variant="ghost"
                aria-label="Remove profile picture"
                title="Remove"
                className="text-muted hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
              >
                <TrashIcon />
              </IconButton>
            </ConfirmForm>
          )}
        </div>
      </Card>

      {/* Side by side at lg: and up — two max-w-xl cards stacked in a
          full-width column left most of a desktop viewport empty below them. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Display name</h2>
            <p className={mutedTextClass}>The name shown on your avatar and beside your activity.</p>
          </div>

          {nameError && (
            <DismissibleAlert clearParams={["nameError"]}>{nameError}</DismissibleAlert>
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
              <SubmitButton>Save name</SubmitButton>
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
            <DismissibleAlert clearParams={["passwordError"]}>{passwordError}</DismissibleAlert>
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
              <SubmitButton>Change password</SubmitButton>
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}
