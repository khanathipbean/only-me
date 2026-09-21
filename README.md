This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Running this machine as a LAN server

The deployed app on Netlify is unchanged by any of this — it builds from the
Git repository with the environment variables set in its own dashboard, and
there is no Netlify configuration file in this repository for a local setup
to interfere with.

This machine can also serve the app to others on the same network, against
its **own** database, so nothing done here reaches the deployed rows.

### One-time setup

```bash
npm install
npm run db:dev            # starts Postgres on 127.0.0.1:54330 (keeps its data)
npm run db:local -- db push   # creates the tables in that database
npm run db:local -- seed      # creates the first admin account
```

Every database command goes through `db:local`, which reads `.env.local` and
refuses to run against anything but a local host. The plain `npx prisma ...`
and `npm run db:seed` read `.env` instead — the deployed database — so use
them only when that is what you mean.

`.env.local` holds this machine's `DATABASE_URL` and is git-ignored. Set
`AUTH_SECRET` in it before the first run:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

File attachments are off until `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
are set in `.env.local`. Everything else works without them. To turn them on,
create a second Supabase project with a bucket named `uploads` — see the
comments in `.env.local`.

### Running it

```bash
npm run build
npm run start:server
```

Others reach it at `http://<this-machine-ip>:3000`. Find the address with:

```powershell
ipconfig
```

and read the **IPv4 Address** of the adapter that is actually connected
(usually `Wi-Fi` or `Ethernet`) — something like `192.168.1.42`.

Windows Firewall blocks inbound connections by default, so the port has to be
opened once, from an **Administrator** PowerShell:

```powershell
New-NetFirewallRule -DisplayName "only-me dev server" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```

`-Profile Private` keeps the rule to networks marked Private. On a network
marked Public, Windows treats every other machine as untrusted and the rule
will not apply — change the network's profile rather than widening the rule.

`npm run dev:server` does the same over `next dev`, for working on the code
while someone else looks at it.

### What is shared with Netlify, and what is not

| | Deployed (Netlify) | This machine |
| --- | --- | --- |
| Database | Supabase | Postgres on this machine |
| Accounts | Supabase | separate — created here |
| Files | Supabase Storage | off, or a second Supabase project |
| Sessions | own `AUTH_SECRET` | own `AUTH_SECRET` |
| Code | this repository | this repository |

The code is the only thing in common. Nothing written on one appears on the
other.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
