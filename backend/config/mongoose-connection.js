const mongoose = require("mongoose");
const config = require("config");
const dbgr = require("debug")("development:mongoose");

const connectDB = async () => {
    try {
        mongoose.set('bufferCommands', false); // Disable buffering to fail fast if not connected
        const baseUri = config.get("MONGODB_URI").replace(/\/+$/, ''); // Remove trailing slashes
        const conn = await mongoose.connect(`${baseUri}/scatch`);
        dbgr("MongoDB connected: " + conn.connection.host);
        console.log("MongoDB connected successfully");
    } catch (err) {
        dbgr(err);
        console.error("MongoDB connection error:", err.message);
        process.exit(1);
    }
};

module.exports = connectDB;