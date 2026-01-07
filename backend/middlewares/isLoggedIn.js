const jwt = require("jsonwebtoken");
const userModel = require("../models/user-model");

module.exports = async function isLoggedIn(req, res, next) {
    if (!req.cookies.token) {
        if (req.flash) req.flash("error", "You need to login first");
        return res.redirect("/");
    }

    try {
        let decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
        let user = await userModel
            .findOne({ email: decoded.email })
            .select("-password");

        if (!user) {
            if (req.flash) req.flash("error", "User not found. Please login again.");
            return res.redirect("/");
        }

        req.user = user;
        next();
    } catch (err) {
        console.error("Auth error:", err.message);
        if (req.flash) req.flash("error", "Session expired. Please login again.");
        return res.redirect("/");
    }
};
