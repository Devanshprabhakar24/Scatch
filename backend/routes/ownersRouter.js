const express = require("express");
const router = express.Router();
const ownerModel = require("../models/owners-model");
const productModel = require("../models/product-model");
const upload = require("../config/multer-config");
const bcrypt = require("bcrypt");

// Middleware to check if owner is logged in
function isOwnerLoggedIn(req, res, next) {
    if (req.cookies.ownerToken) {
        return next();
    }
    req.flash("error", "Please login to access admin panel");
    res.redirect("/owners/login");
}

// Owner Login Page
router.get("/login", function (req, res) {
    let error = req.flash("error");
    res.render("owner-login", { error });
});

// Owner Login
router.post("/login", async function (req, res) {
    try {
        let { email, password } = req.body;
        let owner = await ownerModel.findOne({ email: email });

        if (!owner) {
            req.flash("error", "Invalid email or password");
            return res.redirect("/owners/login");
        }

        // Check password (if hashed, use bcrypt.compare)
        if (owner.password === password) {
            const isProd = process.env.NODE_ENV === 'production';
            res.cookie("ownerToken", owner._id, {
                httpOnly: true,
                secure: isProd,
                sameSite: isProd ? 'lax' : 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: '/'
            });
            res.redirect("/owners/admin");
        } else {
            req.flash("error", "Invalid email or password");
            return res.redirect("/owners/login");
        }
    } catch (err) {
        console.error(err);
        req.flash("error", "Login failed. Please try again.");
        res.redirect("/owners/login");
    }
});

// Owner Logout
router.get("/logout", function (req, res) {
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie("ownerToken", "", {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'lax' : 'lax',
        expires: new Date(0),
        path: '/'
    });
    res.redirect("/owners/login");
});

if (process.env.NODE_ENV === "development") {
    router.post("/create", async function (req, res) {
        let owners = await ownerModel.find();
        if (owners.length > 0) return res.status(503).send("You don't have permission to create a new owner.")
        let { fullname, email, password } = req.body;

        let createdowner = await ownerModel.create({
            fullname,
            email,
            password
        })
        res.status(201).send("Owner created successfully");
    });
}

router.get("/admin", isOwnerLoggedIn, function (req, res) {
    let success = req.flash("success");
    res.render("admin", { success });
});

router.get("/product/create", isOwnerLoggedIn, function (req, res) {
    let success = req.flash("success");
    res.render("createproducts", { success });
});

router.post("/product/create", isOwnerLoggedIn, upload.single("image"), async function (req, res) {
    try {
        let { name, price, discount, bgcolor, panelcolor, textcolor } = req.body;

        let product = await productModel.create({
            image: req.file.buffer,
            name,
            price,
            discount,
            bgcolor,
            panelcolor,
            textcolor
        });
        req.flash("success", "Product created successfully");
        res.redirect("/owners/admin");
    } catch (err) {
        res.send(err.message);
    }
});

module.exports = router;