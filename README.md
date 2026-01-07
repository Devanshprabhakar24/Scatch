# Scatch E-Commerce Project

This project is organized into separate backend and frontend directories.

## Project Structure

```
scatch/
├── backend/          # Node.js/Express backend API
│   ├── app.js        # Main application file
│   ├── config/       # Configuration files
│   ├── controllers/  # Route controllers
│   ├── middlewares/  # Custom middleware
│   ├── models/       # Database models
│   ├── routes/       # API routes
│   ├── utils/        # Utility functions
│   ├── package.json  # Backend dependencies
│   └── .env          # Environment variables
│
└── frontend/         # Frontend assets and views
    ├── public/       # Static files (images, stylesheets)
    └── views/        # EJS templates
```

## Getting Started

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

The frontend currently uses EJS templates served by the backend. Static assets are in the `frontend/public` directory and templates are in `frontend/views`.

## Environment Variables

Make sure to configure your `.env` file in the backend directory with the necessary environment variables.
