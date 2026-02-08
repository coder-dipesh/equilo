# Equilo - Django REST API

A Django REST API project configured for Vercel deployment with CI/CD support. Designed to work with a React frontend.

## Tech Stack

- **Backend**: Django 5 + Django REST Framework
- **API**: REST API with CORS enabled for React
- **Deployment**: Vercel (serverless)
- **CI/CD**: GitHub Actions

## Setup

### Local Development

1. Create and activate a virtual environment:

   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Run the development server:

   ```bash
   python manage.py runserver
   ```

4. API will be available at `http://localhost:8000/api/hello/`

### React Frontend

The API is configured with CORS to accept requests from `http://localhost:3000` (default React dev server). Update `CORS_ALLOWED_ORIGINS` in `equilo/settings.py` when deploying your frontend.

Example fetch from React:

```javascript
fetch('http://localhost:8000/api/hello/')
  .then(res => res.json())
  .then(data => console.log(data));
```

## Deploy to Vercel

1. Push your code to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Vercel will auto-detect the Python/Django setup from `vercel.json`
4. Add environment variables in Vercel Dashboard:
   - `DJANGO_SECRET_KEY` (required for production)
   - `DEBUG=False` (for production)

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DJANGO_SECRET_KEY` | Secret key for Django (generate a secure one) | Production |
| `DEBUG` | Set to `False` in production | Production |
| `DATABASE_URL` | For persistent DB (add `dj-database-url` to requirements) | Optional |

## CI/CD

GitHub Actions runs on push/PR to `main` and `develop`:

- Installs dependencies
- Runs `python manage.py check`

Extend `.github/workflows/ci.yml` to add tests, linting, or deployment.

## Project Structure

```
equilo/
├── equilo/          # Django project config
│   ├── settings.py  # Vercel + CORS + REST config
│   ├── urls.py
│   └── wsgi.py      # Vercel entry point (app variable)
├── api/             # REST API app
│   ├── views.py     # API endpoints
│   └── urls.py
├── vercel.json      # Vercel deployment config
├── requirements.txt
└── manage.py
```
