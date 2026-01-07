const express = require("express");
const router = express.Router();
const ownerModel = require("../models/owners-model");
const productModel = require("../models/product-model");
const userModel = require("../models/user-model");
const orderModel = require("../models/order-model");
const upload = require("../config/multer-config");
const bcrypt = require("bcrypt");

// Helper function to get order timeline
function getOrderTimeline(order) {
    const statuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
    const timeline = [];

    const statusMessages = {
        pending: 'Order placed',
        confirmed: 'Order confirmed',
        processing: 'Being prepared',
        shipped: 'On the way',
        delivered: 'Delivered'
    };

    const statusIcons = {
        pending: 'ri-shopping-bag-line',
        confirmed: 'ri-checkbox-circle-fill',
        processing: 'ri-loader-4-line',
        shipped: 'ri-truck-line',
        delivered: 'ri-checkbox-circle-fill'
    };

    statuses.forEach((status, index) => {
        const isCompleted = statuses.indexOf(order.orderStatus) >= index;
        const isCurrentStatus = order.orderStatus === status;

        timeline.push({
            status: status,
            message: statusMessages[status],
            icon: statusIcons[status],
            completed: isCompleted && order.orderStatus !== 'cancelled',
            current: isCurrentStatus && order.orderStatus !== 'cancelled',
            cancelled: order.orderStatus === 'cancelled',
            date: isCompleted ? order.updatedAt : null
        });
    });

    return timeline;
}

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

router.get("/admin", isOwnerLoggedIn, async function (req, res) {
    try {
        let products = await productModel.find();
        let success = req.flash("success");
        res.render("admin", { success, products });
    } catch (err) {
        res.render("admin", { success: "", products: [] });
    }
});

// All Users Page
router.get("/users", isOwnerLoggedIn, async function (req, res) {
    try {
        let users = await userModel.find().select("-password");
        res.render("admin-users", { users });
    } catch (err) {
        res.render("admin-users", { users: [] });
    }
});

// All Orders Page
router.get("/orders", isOwnerLoggedIn, async function (req, res) {
    try {
        console.log("Fetching all orders for admin...");
        let orders = await orderModel.find()
            .populate("user", "fullname email")
            .sort({ createdAt: -1 });
        console.log("Orders found:", orders.length);
        res.render("admin-orders", { orders });
    } catch (err) {
        console.error("Admin orders fetch error:", err);
        res.render("admin-orders", { orders: [] });
    }
});

// Single Order Detail
router.get("/order/:id", isOwnerLoggedIn, async function (req, res) {
    try {
        let order = await orderModel.findById(req.params.id)
            .populate("user", "fullname email contact")
            .populate("products.product", "name price image");
        if (!order) {
            return res.redirect("/owners/orders");
        }
        res.render("admin-order-detail", { order });
    } catch (err) {
        res.redirect("/owners/orders");
    }
});

// Update Order Status
router.post("/order/:id/status", isOwnerLoggedIn, async function (req, res) {
    try {
        let { orderStatus } = req.body;
        await orderModel.findByIdAndUpdate(req.params.id, {
            orderStatus,
            updatedAt: Date.now()
        });

        // Return JSON for AJAX requests
        if (req.headers['content-type'].includes('application/json') || req.xhr) {
            return res.json({ success: true, message: "Order status updated" });
        }

        res.redirect("/owners/orders");
    } catch (err) {
        if (req.headers['content-type'].includes('application/json') || req.xhr) {
            return res.status(500).json({ success: false, message: err.message });
        }
        res.redirect("/owners/orders");
    }
});

// API: Get order tracking
router.get("/api/order/:id/track", isOwnerLoggedIn, async function (req, res) {
    try {
        let order = await orderModel.findById(req.params.id)
            .populate("user", "fullname email contact")
            .populate("products.product", "name price image");

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const timeline = getOrderTimeline(order);
        res.json({ success: true, order, timeline });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get("/product/create", isOwnerLoggedIn, function (req, res) {
    let success = req.flash("success");
    res.render("createproducts", { success });
});

router.post("/product/create", isOwnerLoggedIn, upload.single("image"), async function (req, res) {
    try {
        let {
            name, price, discount, bgcolor, panelcolor, textcolor, description, features,
            inStock, stockQuantity, freeShipping, freeShippingMinOrder,
            deliveryDays, expressDeliveryDays, returnDays, warrantyYears
        } = req.body;

        // Parse features from textarea (one per line)
        let featuresArray = [];
        if (features && features.trim()) {
            featuresArray = features.split('\n').map(f => f.trim()).filter(f => f.length > 0);
        }

        let product = await productModel.create({
            image: req.file.buffer,
            name,
            price,
            discount: discount || 0,
            bgcolor,
            panelcolor,
            textcolor,
            description: description || undefined,
            features: featuresArray.length > 0 ? featuresArray : undefined,
            inStock: inStock === 'on' || inStock === true,
            stockQuantity: stockQuantity || 100,
            freeShipping: freeShipping === 'on' || freeShipping === true,
            freeShippingMinOrder: freeShippingMinOrder || 500,
            deliveryDays: deliveryDays || '5-7',
            expressDeliveryDays: expressDeliveryDays || '2-3',
            returnDays: returnDays || 30,
            warrantyYears: warrantyYears || 1
        });
        req.flash("success", "Product created successfully");
        res.redirect("/owners/admin");
    } catch (err) {
        res.send(err.message);
    }
});

module.exports = router;