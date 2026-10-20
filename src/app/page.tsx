import { redirect } from "next/navigation";

/**
 * The site's own address had no page at all, so typing the domain — or
 * opening a bookmark of it — answered "We couldn't find that". It had always
 * done that; the 404 page added recently only made it look deliberate.
 *
 * Projects is where the header's logo already points, so it is where the app
 * considers home. Nothing is checked here: anyone not signed in is sent to
 * the login page by `authorized` in `auth.config.ts` before this is reached.
 */
export default function Home() {
  redirect("/projects");
}
