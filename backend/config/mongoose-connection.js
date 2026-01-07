const mongoose = require("mongoose");
const config = require("config");
const dbgr = require("debug")("development:mongoose");

const connectDB = async () => {
    try {
        // Try environment variable first, then config
        let baseUri = process.env.MONGODB_URI || config.get("MONGODB_URI");
        baseUri = baseUri.replace(/\/+$/, ''); // Remove trailing slashes

        const fullUri = `${baseUri}/scatch`;
        console.log("Connecting to MongoDB...");
        console.log("URI starts with:", baseUri.substring(0, 20) + "...");

        const conn = await mongoose.connect(fullUri, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });
        dbgr("MongoDB connected: " + conn.connection.host);
        console.log("MongoDB connected successfully to:", conn.connection.host);

        // Drop problematic indexes after connection
        try {
            const db = conn.connection.db;
            const collections = await db.listCollections({ name: 'orders' }).toArray();
            if (collections.length > 0) {
                const indexes = await db.collection('orders').indexes();
                const hasOrderIdIndex = indexes.some(idx => idx.name === 'orderId_1');
                if (hasOrderIdIndex) {
                    await db.collection('orders').dropIndex('orderId_1');
                    console.log("Dropped problematic orderId_1 index");
                }
            }
        } catch (indexErr) {
            // Ignore index errors - collection might not exist yet
            console.log("Index cleanup:", indexErr.message);
        }

        return conn;
    } catch (err) {
        dbgr(err);
        console.error("MongoDB connection error:", err.message);
        console.error("Full error:", err);
        // Don't exit, let the error propagate
        throw err;
    }
};

module.exports = connectDB;