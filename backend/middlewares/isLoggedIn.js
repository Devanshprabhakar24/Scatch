const jwt = require("jsonwebtoken");
const userModel = require("../models/user-model");

module.exports = async function isLoggedIn(req, res, next) {
    try {
        if (!req.cookies.token) {
            req.flash("error", "you need to login first");
            return res.redirect("/");
        }

        let decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
        let user = await userModel
            .findOne({ email: decoded.email })
            .select("-password");

        if (!user) {
            req.flash("error", "User not found. Please login again.");
            return res.redirect("/");
        }

        req.user = user;
        return next();
    } catch (err) {
        console.error("Auth error:", err.message);
        req.flash("error", "Session expired. Please login again.");
        return res.redirect("/");
    }
};
