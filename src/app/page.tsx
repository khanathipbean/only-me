import { auth, signOut } from "@/auth";

export default async function Home() {
  const session = await auth();

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <main>
      <h1>Test Management System</h1>
      <p>Logged in as {session?.user?.email}</p>
      <form action={logout}>
        <button type="submit">Log out</button>
      </form>
    </main>
  );
}
