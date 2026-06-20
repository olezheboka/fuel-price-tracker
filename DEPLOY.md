# Deploying to Vercel

This project is configured to be deployed as a full-stack application on Vercel (Frontend + Serverless Backend).

## Steps

1.  **Push to GitHub**: Ensure your latest changes (including `vercel.json`) are pushed to your GitHub repository.
    ```bash
    git push origin main
    ```

2.  **Import to Vercel**:
    *   Go to [Vercel Dashboard](https://vercel.com/dashboard).
    *   Click **"Add New..."** -> **"Project"**.
    *   Find your `fuel-price-tracker` repository and click **"Import"**.

3.  **Project Configuration**:
    *   **Framework Preset**: Select **Vite** (it might auto-detect).
    *   **Root Directory**: Leave as `./` (root).
    *   **Environment Variables**:
        *   If you change your API logic in the future, add variables here. For now, the default SQLite and scraper logic runs within the function execution context (note: standard SQLite file won't persist data between cold starts in serverless; for persistent data, consider using Vercel Postgres or an external database like Turso/Supabase in the future).
    *   Click **"Deploy"**.

## Note on Database Persistence
This deployment uses a local `server/prices.db` SQLite file. **In a Serverless environment (like Vercel), the filesystem is ephemeral.**
*   The database will reset when the function instances are recycled.
*   The scraper is scheduled to run, but `node-cron` might not run reliably in a serverless environment because the function only runs when requested.
*   **Recommendation**: For a production-grade app, switch the backend to use an external database (Postgres/MySQL) and use Vercel Cron Jobs instead of `node-cron`.
