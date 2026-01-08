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

// DEBUG: Test orders in database (remove in production)
router.get("/debug-orders", async function (req, res) {
    try {
        const mongoose = require("mongoose");
        const connState = mongoose.connection.readyState;
        const stateNames = ['disconnected', 'connected', 'connecting', 'disconnecting'];

        const orders = await orderModel.find().lean();
        const users = await userModel.find().select("fullname email orders cart").lean();

        res.json({
            dbConnection: stateNames[connState],
            orderCount: orders.length,
            orders: orders.map(o => ({
                _id: o._id,
                orderId: o.orderId,
                status: o.orderStatus,
                finalAmount: o.finalAmount,
                createdAt: o.createdAt
            })),
            users: users.map(u => ({
                fullname: u.fullname,
                email: u.email,
                cartItems: u.cart?.length || 0,
                ordersCount: u.orders?.length || 0
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

// DEBUG: Check indexes on orders collection
router.get("/check-indexes", async function (req, res) {
    try {
        const mongoose = require("mongoose");
        const db = mongoose.connection.db;

        // Check if collection exists
        const collections = await db.listCollections({ name: 'orders' }).toArray();
        if (collections.length === 0) {
            return res.json({ message: "Orders collection does not exist yet", indexes: [] });
        }

        const indexes = await db.collection('orders').indexes();
        res.json({
            collectionExists: true,
            indexes: indexes,
            dbState: mongoose.connection.readyState
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DEBUG: Drop orderId index manually
router.get("/drop-orderid-index", async function (req, res) {
    try {
        const mongoose = require("mongoose");
        const db = mongoose.connection.db;

        try {
            await db.collection('orders').dropIndex('orderId_1');
            res.json({ success: true, message: "Dropped orderId_1 index" });
        } catch (e) {
            res.json({ success: false, message: e.message });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DEBUG: Create test order to verify database works
router.get("/test-create-order", async function (req, res) {
    try {
        const mongoose = require("mongoose");

        // Find first user
        const user = await userModel.findOne();
        if (!user) {
            return res.json({ success: false, error: "No users found in database" });
        }

        // Create test order with unique orderId
        const uniqueOrderId = 'TEST' + Date.now() + Math.random().toString(36).substring(2, 8).toUpperCase();

        const orderData = {
            user: user._id,
            products: [{
                name: "Test Product",
                price: 999,
                discount: 0,
                bgcolor: "#3498db"
            }],
            totalAmount: 999,
            totalDiscount: 0,
            platformFee: 20,
            shippingFee: 0,
            finalAmount: 1019,
            orderId: uniqueOrderId,
            shippingAddress: {
                fullname: user.fullname || "Test User",
                phone: "1234567890",
                address: "Test Address",
                city: "Test City",
                state: "Test State",
                pincode: "123456"
            },
            paymentMethod: 'cod',
            paymentStatus: 'pending',
            orderStatus: 'confirmed'
        };

        // Try creating the order and log everything
        console.log("Attempting to create order with data:", JSON.stringify(orderData, null, 2));

        const testOrder = await orderModel.create(orderData);

        console.log("Order created successfully:", testOrder._id);

        return res.json({
            success: true,
            message: "Test order created!",
            order: {
                _id: testOrder._id,
                orderId: testOrder.orderId,
                finalAmount: testOrder.finalAmount
            },
            dbState: mongoose.connection.readyState
        });
    } catch (err) {
        console.error("Test create order error:", err);
        // Return 200 so we can see the error in browser
        return res.json({
            success: false,
            error: err.message,
            stack: err.stack ? err.stack.split('\n').slice(0, 5) : null,
            name: err.name,
            code: err.code
        });
    }
});

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
            .sort({ createdAt: -1 })
            .lean();
        console.log("Orders found:", orders ? orders.length : 0);
        res.render("admin-orders", { orders: orders || [] });
    } catch (err) {
        console.error("Admin orders fetch error:", err);
        res.render("admin-orders", { orders: [] });
    }
});

// API endpoint to check orders (for debugging)
router.get("/api/orders", isOwnerLoggedIn, async function (req, res) {
    try {
        let orders = await orderModel.find().lean();
        res.json({ success: true, count: orders.length, orders });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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
            deliveryDays, expressDeliveryDays, returnDays, warrantyYears,
            category, sizes, colors, tags
        } = req.body;

        // Parse features from textarea (one per line)
        let featuresArray = [];
        if (features && features.trim()) {
            featuresArray = features.split('\n').map(f => f.trim()).filter(f => f.length > 0);
        }

        // Parse sizes and colors
        let sizesArray = sizes ? sizes.split(',').map(s => s.trim()).filter(s => s) : [];
        let colorsArray = colors ? colors.split(',').map(c => c.trim()).filter(c => c) : [];
        let tagsArray = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];

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
            warrantyYears: warrantyYears || 1,
            category: category || 'uncategorized',
            sizes: sizesArray,
            colors: colorsArray,
            tags: tagsArray
        });
        req.flash("success", "Product created successfully");
        res.redirect("/owners/admin");
    } catch (err) {
        res.send(err.message);
    }
});

// Edit product page
router.get("/product/edit/:id", isOwnerLoggedIn, async function (req, res) {
    try {
        let product = await productModel.findById(req.params.id);
        if (!product) {
            req.flash("error", "Product not found");
            return res.redirect("/owners/admin");
        }
        res.render("edit-product", { product });
    } catch (err) {
        req.flash("error", "Error loading product");
        res.redirect("/owners/admin");
    }
});

// Update product
router.post("/product/edit/:id", isOwnerLoggedIn, upload.single("image"), async function (req, res) {
    try {
        let updateData = { ...req.body };

        // Handle checkboxes
        updateData.inStock = req.body.inStock === 'on';
        updateData.freeShipping = req.body.freeShipping === 'on';
        updateData.isFlashSale = req.body.isFlashSale === 'on';

        // Parse arrays
        if (updateData.features) {
            updateData.features = updateData.features.split('\n').map(f => f.trim()).filter(f => f);
        }
        if (updateData.sizes) {
            updateData.sizes = updateData.sizes.split(',').map(s => s.trim()).filter(s => s);
        }
        if (updateData.colors) {
            updateData.colors = updateData.colors.split(',').map(c => c.trim()).filter(c => c);
        }
        if (updateData.tags) {
            updateData.tags = updateData.tags.split(',').map(t => t.trim()).filter(t => t);
        }

        // If new image uploaded
        if (req.file) {
            updateData.image = req.file.buffer;
        }

        await productModel.findByIdAndUpdate(req.params.id, updateData);
        req.flash("success", "Product updated successfully");
        res.redirect("/owners/admin");
    } catch (err) {
        req.flash("error", "Error updating product");
        res.redirect("/owners/admin");
    }
});

// Delete product
router.post("/product/delete/:id", isOwnerLoggedIn, async function (req, res) {
    try {
        await productModel.findByIdAndDelete(req.params.id);
        req.flash("success", "Product deleted successfully");
        res.redirect("/owners/admin");
    } catch (err) {
        req.flash("error", "Error deleting product");
        res.redirect("/owners/admin");
    }
});

// ==================== ADMIN ANALYTICS & DASHBOARD ====================

// Dashboard analytics API
router.get("/api/analytics", isOwnerLoggedIn, async function (req, res) {
    try {
        const { period = '30' } = req.query;
        const days = parseInt(period);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Total revenue
        const revenueData = await orderModel.aggregate([
            { $match: { createdAt: { $gte: startDate }, orderStatus: { $ne: 'cancelled' } } },
            { $group: { _id: null, total: { $sum: '$finalAmount' }, count: { $sum: 1 } } }
        ]);

        // Daily revenue for chart
        const dailyRevenue = await orderModel.aggregate([
            { $match: { createdAt: { $gte: startDate }, orderStatus: { $ne: 'cancelled' } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    revenue: { $sum: '$finalAmount' },
                    orders: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Order status breakdown
        const ordersByStatus = await orderModel.aggregate([
            { $match: { createdAt: { $gte: startDate } } },
            { $group: { _id: '$orderStatus', count: { $sum: 1 } } }
        ]);

        // Top selling products
        const topProducts = await orderModel.aggregate([
            { $match: { createdAt: { $gte: startDate }, orderStatus: { $ne: 'cancelled' } } },
            { $unwind: '$products' },
            {
                $group: {
                    _id: '$products.name',
                    totalSold: { $sum: 1 },
                    revenue: { $sum: '$products.price' }
                }
            },
            { $sort: { totalSold: -1 } },
            { $limit: 10 }
        ]);

        // New customers
        const newCustomers = await userModel.countDocuments({
            createdAt: { $gte: startDate }
        });

        // Total customers
        const totalCustomers = await userModel.countDocuments();

        // Average order value
        const avgOrderValue = revenueData[0]
            ? (revenueData[0].total / revenueData[0].count).toFixed(2)
            : 0;

        // Revenue by category
        const revenueByCategory = await orderModel.aggregate([
            { $match: { createdAt: { $gte: startDate }, orderStatus: { $ne: 'cancelled' } } },
            { $unwind: '$products' },
            {
                $group: {
                    _id: '$products.category',
                    revenue: { $sum: '$products.price' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { revenue: -1 } }
        ]);

        res.json({
            success: true,
            analytics: {
                totalRevenue: revenueData[0]?.total || 0,
                totalOrders: revenueData[0]?.count || 0,
                avgOrderValue,
                newCustomers,
                totalCustomers,
                dailyRevenue,
                ordersByStatus,
                topProducts,
                revenueByCategory
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Analytics dashboard page
router.get("/analytics", isOwnerLoggedIn, async function (req, res) {
    res.render("admin-analytics");
});

// ==================== INVENTORY MANAGEMENT ====================

// Inventory overview
router.get("/inventory", isOwnerLoggedIn, async function (req, res) {
    try {
        let products = await productModel.find()
            .select('name stockQuantity inStock price category soldCount')
            .sort({ stockQuantity: 1 });

        // Get low stock products (less than 10)
        let lowStockProducts = products.filter(p => p.stockQuantity < 10);

        res.render("admin-inventory", { products, lowStockProducts });
    } catch (err) {
        res.render("admin-inventory", { products: [], lowStockProducts: [] });
    }
});

// Update stock quantity
router.post("/inventory/update/:id", isOwnerLoggedIn, async function (req, res) {
    try {
        let { stockQuantity, inStock } = req.body;
        await productModel.findByIdAndUpdate(req.params.id, {
            stockQuantity: parseInt(stockQuantity),
            inStock: inStock === 'on' || inStock === true
        });

        if (req.xhr || req.headers['content-type']?.includes('application/json')) {
            return res.json({ success: true, message: 'Stock updated' });
        }
        req.flash("success", "Stock updated successfully");
        res.redirect("/owners/inventory");
    } catch (err) {
        if (req.xhr) {
            return res.status(500).json({ success: false, error: err.message });
        }
        req.flash("error", "Error updating stock");
        res.redirect("/owners/inventory");
    }
});

// Bulk stock update
router.post("/inventory/bulk-update", isOwnerLoggedIn, async function (req, res) {
    try {
        let { updates } = req.body; // Array of { productId, stockQuantity }

        for (let update of updates) {
            await productModel.findByIdAndUpdate(update.productId, {
                stockQuantity: update.stockQuantity,
                inStock: update.stockQuantity > 0
            });
        }

        res.json({ success: true, message: 'Bulk update completed' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Low stock alerts API
router.get("/api/low-stock", isOwnerLoggedIn, async function (req, res) {
    try {
        let { threshold = 10 } = req.query;
        let lowStockProducts = await productModel.find({
            stockQuantity: { $lt: parseInt(threshold) }
        }).select('name stockQuantity price category');

        res.json({ success: true, products: lowStockProducts });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==================== CUSTOMER MANAGEMENT ====================

// Get single user details
router.get("/user/:id", isOwnerLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findById(req.params.id)
            .select("-password")
            .populate('wishlist', 'name price');

        let orders = await orderModel.find({ user: req.params.id })
            .sort({ createdAt: -1 });

        // Calculate customer statistics
        let totalSpent = orders.reduce((sum, order) => {
            if (order.orderStatus !== 'cancelled') {
                return sum + order.finalAmount;
            }
            return sum;
        }, 0);

        res.render("admin-user-detail", {
            user,
            orders,
            stats: {
                totalOrders: orders.length,
                totalSpent,
                cancelledOrders: orders.filter(o => o.orderStatus === 'cancelled').length
            }
        });
    } catch (err) {
        res.redirect("/owners/users");
    }
});

// Block/Unblock user
router.post("/user/:id/block", isOwnerLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findById(req.params.id);
        user.isBlocked = !user.isBlocked;
        await user.save();

        if (req.xhr) {
            return res.json({ success: true, isBlocked: user.isBlocked });
        }
        req.flash("success", `User ${user.isBlocked ? 'blocked' : 'unblocked'} successfully`);
        res.redirect("/owners/users");
    } catch (err) {
        if (req.xhr) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.redirect("/owners/users");
    }
});

// Search users
router.get("/api/users/search", isOwnerLoggedIn, async function (req, res) {
    try {
        let { q } = req.query;
        let users = await userModel.find({
            $or: [
                { fullname: { $regex: q, $options: 'i' } },
                { email: { $regex: q, $options: 'i' } }
            ]
        }).select("-password").limit(20);

        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==================== ORDERS EXPORT ====================

// Export orders as CSV
router.get("/orders/export", isOwnerLoggedIn, async function (req, res) {
    try {
        let { startDate, endDate, status } = req.query;
        let query = {};

        if (startDate && endDate) {
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        if (status && status !== 'all') {
            query.orderStatus = status;
        }

        let orders = await orderModel.find(query)
            .populate('user', 'fullname email')
            .sort({ createdAt: -1 })
            .lean();

        // Create CSV content
        let csv = 'Order ID,Date,Customer,Email,Products,Total,Status,Payment Method,Payment Status\n';

        orders.forEach(order => {
            let products = order.products.map(p => p.name).join('; ');
            let date = new Date(order.createdAt).toISOString().split('T')[0];
            csv += `"${order.orderId}","${date}","${order.user?.fullname || order.shippingAddress.fullname}","${order.user?.email || 'N/A'}","${products}","${order.finalAmount}","${order.orderStatus}","${order.paymentMethod}","${order.paymentStatus}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=orders-export.csv');
        res.send(csv);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==================== FLASH SALE MANAGEMENT ====================

// Flash sale page
router.get("/flash-sale", isOwnerLoggedIn, async function (req, res) {
    try {
        let flashSaleProducts = await productModel.find({ isFlashSale: true });
        let allProducts = await productModel.find({ isFlashSale: { $ne: true } });
        res.render("admin-flash-sale", { flashSaleProducts, allProducts });
    } catch (err) {
        res.render("admin-flash-sale", { flashSaleProducts: [], allProducts: [] });
    }
});

// Add product to flash sale
router.post("/flash-sale/add", isOwnerLoggedIn, async function (req, res) {
    try {
        let { productId, flashSalePrice, endTime } = req.body;

        await productModel.findByIdAndUpdate(productId, {
            isFlashSale: true,
            flashSalePrice: parseInt(flashSalePrice),
            flashSaleEndTime: new Date(endTime)
        });

        res.json({ success: true, message: 'Product added to flash sale' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Remove from flash sale
router.post("/flash-sale/remove/:id", isOwnerLoggedIn, async function (req, res) {
    try {
        await productModel.findByIdAndUpdate(req.params.id, {
            isFlashSale: false,
            flashSalePrice: null,
            flashSaleEndTime: null
        });

        res.json({ success: true, message: 'Product removed from flash sale' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==================== COUPON MANAGEMENT ====================

const couponModel = require("../models/coupon-model");

// Coupon management page
router.get("/coupons", isOwnerLoggedIn, async function (req, res) {
    try {
        let coupons = await couponModel.find().sort({ createdAt: -1 });
        res.render("admin-coupons", { coupons });
    } catch (err) {
        res.render("admin-coupons", { coupons: [] });
    }
});

// Create coupon
router.post("/coupon/create", isOwnerLoggedIn, async function (req, res) {
    try {
        let {
            code, discountType, discountValue, minimumOrderAmount,
            maxDiscountAmount, expiryDate, usageLimit
        } = req.body;

        // Check if code already exists
        let existing = await couponModel.findOne({ code: code.toUpperCase() });
        if (existing) {
            return res.status(400).json({ success: false, error: 'Coupon code already exists' });
        }

        let coupon = await couponModel.create({
            code: code.toUpperCase(),
            discountType,
            discountValue: parseInt(discountValue),
            minimumOrderAmount: parseInt(minimumOrderAmount) || 0,
            maxDiscountAmount: parseInt(maxDiscountAmount) || null,
            expiryDate: new Date(expiryDate),
            usageLimit: parseInt(usageLimit) || null
        });

        res.json({ success: true, coupon });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delete coupon
router.post("/coupon/delete/:id", isOwnerLoggedIn, async function (req, res) {
    try {
        await couponModel.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Coupon deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Toggle coupon active status
router.post("/coupon/toggle/:id", isOwnerLoggedIn, async function (req, res) {
    try {
        let coupon = await couponModel.findById(req.params.id);
        coupon.isActive = !coupon.isActive;
        await coupon.save();
        res.json({ success: true, isActive: coupon.isActive });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;