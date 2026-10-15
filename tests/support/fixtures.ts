import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * The few things nearly every test file needs, written once.
 *
 * All three below were declared separately in fifteen of the twenty-three
 * test files, byte for byte the same. That costs nothing to read but it does
 * cost when one of them has to change: a fix to how a request is built, or to
 * what a session looks like, is fifteen edits and nothing fails if one is
 * missed.
 */

/** A `NextRequest` for calling a route handler directly, with a JSON body
 *  when one is given. */
export function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

/** What the mocked `auth()` returns for a signed-in user. */
export function sessionFor(userId: string) {
  return {
    user: { id: userId, email: `${userId}@example.com` },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

export async function createUser(email: string) {
  return prisma.user.create({
    data: { email, passwordHash: "irrelevant", name: email },
  });
}

/**
 * A name nothing else in the suite has used.
 *
 * Email and project code are unique columns, and the files share one
 * database, so a test that picks `owner7@example.com` fails the moment
 * another file picks it too — not because either is wrong, but because both
 * were written by hand from a number nobody was tracking. That has cost this
 * project at least six debugging sessions, each one spent reading other files
 * to find the next free number.
 *
 * A counter plus the process start time: the counter keeps names apart within
 * a run, and the timestamp keeps them apart from whatever an earlier run left
 * behind in a database that is not reset between them.
 */
let counter = 0;
const RUN = Date.now().toString(36).slice(-5);

export function uniqueName(prefix: string) {
  counter += 1;
  return `${prefix}-${RUN}-${counter}`;
}

/** `prefix-k3f9a-1@example.com` — unique, and still says which test made it. */
export function uniqueEmail(prefix: string) {
  return `${uniqueName(prefix)}@example.com`;
}

/** Project codes are upper-case by convention and unique by constraint. */
export function uniqueCode(prefix: string) {
  return uniqueName(prefix).toUpperCase();
}
