const mongoose = require("mongoose");
const config = require("config");
const dbgr = require("debug")("development:mongoose");

const connectDB = async () => {
    try {
        const baseUri = config.get("MONGODB_URI").replace(/\/+$/, ''); // Remove trailing slashes
        const conn = await mongoose.connect(`${baseUri}/scatch`, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });
        dbgr("MongoDB connected: " + conn.connection.host);
        console.log("MongoDB connected successfully to:", conn.connection.host);
        return conn;
    } catch (err) {
        dbgr(err);
        console.error("MongoDB connection error:", err.message);
        process.exit(1);
    }
};

module.exports = connectDB;