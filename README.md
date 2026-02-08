# Equilo – Split bills with your place

Shared expense tracking for roommates: create a **Place** (your apartment/house), invite members, log expenses with categories and splits, and view weekly or fortnightly summaries (total expense, my share, what I owe / am owed).

## Tech stack

- **Backend**: Django 5 + Django REST Framework + JWT (Simple JWT)
- **Frontend**: React (Vite) + React Router
- **Database**: Supabase (PostgreSQL) or SQLite for local dev
- **Deploy**: Backend on Vercel, frontend static (Vercel/Netlify)

## Quick start

### Backend (Django)

```bash
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
# Optional: set DATABASE_URL for Supabase (see below)
python manage.py migrate
make run
```

API: `http://localhost:8000/api/`

### Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

App: `http://localhost:3000`

Set `VITE_API_URL=http://localhost:8000/api` if your API is elsewhere (default is `http://localhost:8000/api`).

## Database: Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In **Settings → Database** copy the **Connection string** (URI).
3. Set the env var (use the **Session pooler** or **Transaction pooler** URI for serverless):

   ```bash
   export DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
   ```

4. Run migrations against Supabase:

   ```bash
   export DATABASE_URL="your-connection-string"
   python manage.py migrate
   ```

For local dev without `DATABASE_URL`, the app uses SQLite.

## Features

- **Places** – Create a place (e.g. “Sunset Apartment”), invite members by email; they join via a link.
- **Expenses** – Add amount, description, date (default today), paid by (member), category, and **split between** (checkboxes). Equal split only for now.
- **Categories** – Each place gets default categories (Rent, Utilities, Groceries, Internet, Other); you can add more.
- **Summary** – Per place: choose **weekly** or **fortnightly**. See total expense, my expense, others’ expense, total I paid, total I owe, total owed to me, and balance with each member.

## API (auth)

- `POST /api/auth/register/` – `{ "username", "email?", "password" }` → user + access/refresh tokens
- `POST /api/auth/token/` – `{ "username", "password" }` → access + refresh
- `GET /api/auth/me/` – current user (Bearer token)
- `GET /api/places/` – my places
- `POST /api/places/` – create place `{ "name" }`
- `GET /api/places/<id>/expenses/` – list expenses
- `POST /api/places/<id>/expenses/` – create expense (amount, description, date, paid_by, category, split_user_ids)
- `GET /api/places/<id>/summary/?period=weekly|fortnightly&from=YYYY-MM-DD` – financial summary
- `POST /api/places/<id>/invites/` – invite by email `{ "email" }` (owner only)
- `GET /api/invite/<token>/` – invite info (place name)
- `POST /api/join/<token>/` – join place (authenticated)

## Deploy to production

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for step-by-step instructions:

1. **Supabase** – Create project, get connection string, run `migrate` once.
2. **Backend (Vercel)** – One project, root = repo root; set `DJANGO_SECRET_KEY`, `DEBUG=False`, `DATABASE_URL`, `CORS_ORIGINS`.
3. **Frontend (Vercel)** – Second project, root = `frontend`; set `VITE_API_URL` to your backend URL + `/api`.
4. Set backend `CORS_ORIGINS` to your frontend URL so the API accepts requests.

## Project structure

```
equilo/
├── equilo/           # Django project
├── api/              # REST app (places, expenses, categories, invites, summary)
├── frontend/         # React app (auth, places, expenses, summary, invite/join)
├── vercel.json
├── requirements.txt
└── Makefile
```
