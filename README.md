# NightArcade — virtual-credit crash prototype

A full-stack learning prototype using plain HTML/CSS/JavaScript and Supabase. It has email/password auth, a virtual-credit wallet, server-authoritative crash rounds, and a recent-round history.

**Virtual credits only.** There are no real-money deposits, cash-outs, payment integrations, transfers, or redemption. The example RNG is not certified or suitable for real-money gambling.

## 1. Create a Supabase project
1. Create a project at https://supabase.com/.
2. In Project Settings → API, copy the Project URL and publishable/anon key.
3. Put them in `config.js`. Never put the `service_role` key in frontend code.

## 2. Create database objects
1. Open the Supabase SQL Editor.
2. Run the complete contents of `supabase/schema.sql`.
3. In Authentication → URL Configuration, add your local development URL and deployed site URL to allowed redirect/site URLs.
4. Configure email confirmation as you prefer for testing. For a public deployment, keep confirmation enabled.

The trigger creates a wallet with 1,000 virtual credits when a new auth user is created. Existing accounts created before installing the schema may need their profile/wallet created manually in SQL Editor.

## 3. Deploy the Edge Function
Install the Supabase CLI and sign in, then from this project folder:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy game-round
```

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the Edge Function environment. Do not expose the service role key in `config.js` or any browser code.

## 4. Run the frontend locally
ES modules usually need a local web server, not a `file://` URL. With VS Code, use the Live Server extension, or run:

```bash
python -m http.server 5500
```

Then open http://localhost:5500.

## 5. Publish the frontend
GitHub Pages can host the static frontend. Upload `index.html`, `style.css`, `app.js`, and `config.js` to a repository and enable Pages. Keep the Supabase URL and publishable/anon key in the frontend; these are public identifiers and are protected by database policies, not by secrecy. Do not commit private keys.

## Important design/security notes
- RLS limits wallet, transaction, profile and round reads to the signed-in user.
- Browser clients have no direct write policies for wallets, transactions, or rounds.
- The Edge Function verifies the access token before invoking server-only RPC functions.
- The server decides the crash point and the database server clock decides cashout timing.
- This is educational starter code. Before any public launch, add rate limiting/abuse controls, monitoring, stronger test coverage, and review all Supabase security advisories and settings.
- Do not adapt this prototype for real-money gambling without specialist legal advice, required authorization, compliance controls, and a suitable licensed production infrastructure.
