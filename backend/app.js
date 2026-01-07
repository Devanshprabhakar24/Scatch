const express = require("express");
const app = express();
const cookieParser = require("cookie-parser");
const path = require("path");
const indexRouter = require("./routes/index")
const ownersRouter = require("./routes/ownersRouter")
const productsRouter = require("./routes/productsRouter")
const usersRouter = require("./routes/usersRouter")
const connectDB = require("./config/mongoose-connection")
const flash = require("./middlewares/flash");
const session = require("express-session");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const MongoStore = require("connect-mongo");
const config = require("config");
const mongoose = require("mongoose");
require("dotenv").config()

// Connect to MongoDB before starting server
connectDB().then(() => {
    const isProd = process.env.NODE_ENV === "production";

    // Trust reverse proxy (for secure cookies behind proxies)
    app.set("trust proxy", 1);

    // Security + performance middleware (keep UI/CDN compatibility)
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" }
    }));
    app.use(compression());

    // In-place request sanitizer compatible with Express 5
    function scrub(obj) {
        if (!obj || typeof obj !== 'object') return;
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (key.startsWith('$') || key.includes('.')) {
                delete obj[key];
                continue;
            }
            if (val && typeof val === 'object') scrub(val);
        }
    }
    app.use((req, res, next) => {
        try {
            scrub(req.body);
            scrub(req.query);
            scrub(req.params);
        } catch (_) { }
        next();
    });

    // Rate limiting
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        limit: 100,
        standardHeaders: true,
        legacyHeaders: false,
    });
    app.use(limiter);

    // Logging (dev only verbose)
    if (!isProd) {
        app.use(morgan("dev"));
    }

    // Sessions with Mongo store
    app.use(session({
        resave: false,
        saveUninitialized: false,
        secret: process.env.SESSION_SECRET,
        cookie: {
            httpOnly: true,
            secure: isProd,
            sameSite: isProd ? "lax" : "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000
        },
        store: MongoStore.create({
            mongoUrl: `${config.get("MONGODB_URI").replace(/\/+$/, '')}/scatch`,
            ttl: 14 * 24 * 60 * 60 // 14 days
        })
    }));

    app.use(flash());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());
    app.use(express.static(path.join(__dirname, "../frontend/public"), {
        maxAge: isProd ? "7d" : 0
    }));
    app.set("view engine", "ejs");
    app.set("views", path.join(__dirname, "../frontend/views"));

    // Routes
    app.use("/", indexRouter);
    app.use("/owners", ownersRouter);
    app.use("/users", usersRouter);
    app.use("/products", productsRouter);

    // 404 handler
    app.use((req, res) => {
        res.status(404).render("404");
    });

    // Central error handler
    app.use((err, req, res, next) => {
        console.error(err);
        if (res.headersSent) return next(err);
        const isProd = process.env.NODE_ENV === "production";
        if (!isProd) {
            const out = err.stack || err.message || String(err);
            res.status(500).type('text/plain').send(out);
        } else {
            res.status(500).send("Something went wrong.");
        }
    });

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
    });
});
