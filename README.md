# Task Manager

Task Manager is a clean, responsive single-page application for creating, organizing, and completing personal tasks. It uses Supabase Auth for accounts and a Supabase `tasks` table for persistent task data, including categories, importance, and due dates. Tasks with due dates appear on a navigable monthly calendar, and the Edit action can update the title, description, category, importance, or due date.

**Deployed application:** (https://fanciful-duckanoo-e1191f.netlify.app/).

**Source repository:** [github.com/rhart2022/Task-Manager](https://github.com/rhart2022/Task-Manager)

**Youtube link** (https://youtu.be/cFuqVRy7DSI)


## Run it

1. Replace `YOUR-PROJECT.supabase.co` and `YOUR_SUPABASE_ANON_KEY` in `app.js` with the values from Supabase Project Settings > API.
2. Open `index.html` through a local static server or your preferred hosting service.
3. Register an account, then create and manage tasks.

If your existing `tasks` table was created before categories were added, run [supabase-migration.sql](supabase-migration.sql) once in the Supabase SQL editor:

```sql
alter table public.tasks add column if not exists category text;
```

Email confirmation may be enabled by default in Supabase Auth. When it is enabled, confirm the registration email before logging in.

## Debugging "Failed to fetch"

1. Open the browser Developer Tools Console and Network tabs. The application logs the exact Supabase error object with `console.error`, including whether the failure happened during `signUp` or `signInWithPassword`.
2. In Supabase Dashboard, open **Project Settings > API**. Copy the **Project URL** into `SUPABASE_URL` and the public **anon key** into `SUPABASE_ANON_KEY`. Do not use the service-role key in browser code. Confirm the URL is the matching project URL, uses `https://`, and has no extra path or trailing typo.
3. In Supabase Dashboard, open **Authentication > URL Configuration**. Add the exact origin where the app is running to **Site URL** or **Redirect URLs**, for example `http://localhost:5500` or `http://127.0.0.1:5500`. The origin must match protocol, hostname, and port; `localhost` and `127.0.0.1` are different origins.
4. Use a local HTTP server instead of opening the file as `file:///...`. For example, use VS Code Live Server and add its actual port to the Supabase URL configuration.
5. In the Network tab, inspect the failed request URL. It should begin with `https://<your-project-ref>.supabase.co/auth/v1/`. If it points to another project, correct `SUPABASE_URL`; if the request is blocked before a response and the console mentions CORS, correct the URL/origin settings and any browser extension or proxy blocking the request.
6. If the request reaches Supabase with a `401` or `403`, replace the API key from **Project Settings > API**. If it returns a normal Auth error such as an invalid password or existing email, connectivity and CORS are working and the message is an account issue instead.

If the browser reports only `Failed to fetch` and the hostname does not resolve, the request never reached Supabase. Copy the Project URL directly from **Project Settings > API** rather than reconstructing it from the key, and check that the project is not paused or deleted. The configured endpoint is `https://xyszhsuiamafhrvblpdf.supabase.co`.
