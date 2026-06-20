# Fuel Price Tracker

A web application that tracks and visualizes fuel prices from gas stations in Latvia (Neste, Circle K, Virši, Viada). It scrapes price data, stores history, and presents interactive charts and insights.

## Features

- **Real-time Price Tracking**: Fetches latest fuel prices for 95, 98, Diesel, and Pro Diesel.
- **Historical Data**: View price history trends over 24h, 7 days, 30 days, or 90 days.
- **Interactive Charts**: Visualizes price movements using responsive line charts.
- **Price Insights**: Automatically calculates and displays price changes (increase/decrease) and percentage trends.
- **Multi-language Support**: Fully localized in English (EN), Latvian (LV), and Russian (RU).
- **Responsive Design**: Optimized for both desktop and mobile devices.
- **Station Locations**: Direct links to Google Maps for station locations.

## Tech Stack

### Client
- **Framework**: React 19 (via Vite)
- **Styling**: Tailwind CSS v3
- **Charts**: Recharts
- **Internationalization**: i18next
- **Icons**: Lucide React
- **HTTP Client**: Axios

### Server
- **Runtime**: Node.js & Express
- **Database**: SQLite (local) / PostgreSQL (via Vercel Postgres)
- **Scraping**: Cheerio
- **Deployment**: Vercel

## Project Structure

```
/
├── client/         # Frontend React application
│   ├── src/        # Source code
│   └── public/     # Static assets
├── server/         # Backend API and scraper
│   ├── index.js    # Express server entry point
│   ├── scraper.js  # Logic to scrape Neste prices
│   └── db.js       # Database connection handling
└── vercel.json     # Vercel deployment configuration
```

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd fuel-price-tracker
   ```

2. **Install Client Dependencies:**
   ```bash
   cd client
   npm install
   ```

3. **Install Server Dependencies:**
   ```bash
   cd ../server
   npm install
   ```

### Running Locally

1. **Start the Backend Server:**
   ```bash
   cd server
   node index.js
   ```
   Server will start on `http://localhost:3000`.

2. **Start the Frontend Development Server:**
   ```bash
   cd client
   npm run dev
   ```
   Client will be available at `http://localhost:5173`.

## Deployment

The project is configured for deployment on **Vercel**.
- `client` is deployed as the frontend.
- `server` functions are deployed as Serverless Functions via `vercel.json`.

## License

ISC
