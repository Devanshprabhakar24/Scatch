# Frontend Deployment to Vercel

## Quick Start

1. **Push to GitHub** (if not already):

   ```bash
   git add .
   git commit -m "Add Vercel config for frontend"
   git push origin master
   ```

2. **Connect to Vercel**:

   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repo (`Devanshprabhakar24/Scatch`)
   - Select "Frontend" folder as the root directory

3. **Set Environment Variable**:

   - In Vercel dashboard → Settings → Environment Variables
   - Add:
     ```
     BACKEND_URL=https://scatch-backend-vdrh.onrender.com
     ```
   - (Replace with your actual Render backend URL)

4. **Deploy**:
   - Click "Deploy"

## What This Does

- **vercel.json**: Configures Vercel to serve static files and proxy API requests to your Render backend
- **Rewrites**: Automatically forwards `/api/*`, `/owners/*`, `/users/*`, `/products/*` requests to your backend
- **Cache**: Sets 1-hour cache for static assets

## Notes

- EJS views are pre-rendered on your Express backend, so Vercel serves them as static HTML
- All API calls are proxied to your Render backend automatically
- Update `BACKEND_URL` if you change your backend Render URL

## Testing Locally

```bash
cd frontend
npm run build
```

Your frontend will be live at your Vercel domain (e.g., `https://scatch-frontend-xxx.vercel.app`)
