const express = require("express");
const router = express.Router();
const isLoggedIn = require("../middlewares/isLoggedIn");
const userModel = require("../models/user-model");
const productModel = require("../models/product-model");
const orderModel = require("../models/order-model");
const couponModel = require("../models/coupon-model");
const bcrypt = require("bcrypt");
const {
    registerUser,
    loginUser,
    logout,
} = require("../controllers/authController");

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

router.get("/", function (req, res) {
    res.send("hey it's working");
});

router.post("/register", registerUser);

router.post("/login", loginUser);

router.get("/logout", logout);

// View cart - must come before /cart/:productId
router.get("/cart", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });

        // Fetch products from cart
        let cartProducts = await productModel.find({ _id: { $in: user.cart } });

        // Calculate totals
        let totalPrice = 0;
        let totalDiscount = 0;
        cartProducts.forEach(product => {
            totalPrice += product.price;
            totalDiscount += product.discount || 0;
        });

        res.render("cart", {
            cart: cartProducts,
            totalPrice,
            totalDiscount,
            finalAmount: totalPrice - totalDiscount + 20 // 20 is platform fee
        });
    } catch (err) {
        res.send(err.message);
    }
});

// Remove from cart - must come before /cart/:productId
router.get("/cart/remove/:productId", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        // Convert ObjectIds to strings for comparison
        const productIdToRemove = req.params.productId;
        const cartStrings = user.cart.map(id => id.toString());
        const index = cartStrings.indexOf(productIdToRemove);

        if (index > -1) {
            user.cart.splice(index, 1);
            await user.save();
        }
        res.redirect("/users/cart");
    } catch (err) {
        console.error("Remove from cart error:", err);
        res.redirect("/users/cart?error=" + encodeURIComponent(err.message));
    }
});

// Add product to cart
router.get("/cart/add/:productId", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        user.cart.push(req.params.productId);
        await user.save();
        req.flash("success", "Product added to cart");
        res.redirect("/shop");
    } catch (err) {
        res.send(err.message);
    }
});

// Checkout page
router.get("/checkout", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });

        if (!user.cart || user.cart.length === 0) {
            req.flash("error", "Your cart is empty");
            return res.redirect("/users/cart");
        }

        // Fetch products from cart
        let cartProducts = await productModel.find({ _id: { $in: user.cart } });

        // Calculate totals
        let totalPrice = 0;
        let totalDiscount = 0;
        cartProducts.forEach(product => {
            totalPrice += product.price;
            totalDiscount += product.discount || 0;
        });

        res.render("checkout", {
            user,
            cart: cartProducts,
            totalPrice,
            totalDiscount,
            finalAmount: totalPrice - totalDiscount + 20
        });
    } catch (err) {
        res.send(err.message);
    }
});

// Place order
router.post("/place-order", isLoggedIn, async function (req, res) {
    try {
        console.log("[ORDER] Starting order placement...");

        // Get user
        const user = await userModel.findOne({ email: req.user.email });
        if (!user || !user.cart || user.cart.length === 0) {
            console.log("[ORDER] Cart is empty");
            return res.redirect("/users/cart?error=Cart is empty");
        }

        console.log("[ORDER] User found, cart items:", user.cart.length);

        // Get cart products
        const cartProducts = await productModel.find({ _id: { $in: user.cart } });
        if (!cartProducts.length) {
            console.log("[ORDER] Products not found");
            return res.redirect("/users/cart?error=Products not found");
        }

        console.log("[ORDER] Products found:", cartProducts.length);

        // Calculate totals
        let totalPrice = 0;
        let totalDiscount = 0;
        cartProducts.forEach(p => {
            totalPrice += p.price || 0;
            totalDiscount += p.discount || 0;
        });
        const finalAmount = totalPrice - totalDiscount + 20;

        console.log("[ORDER] Totals calculated - Final:", finalAmount);

        // Create order products (without image to reduce size)
        const orderProducts = cartProducts.map(p => ({
            product: p._id,
            name: p.name,
            price: p.price,
            discount: p.discount || 0,
            bgcolor: p.bgcolor
        }));

        // Generate orderId
        const orderId = 'ORD' + Date.now() + Math.random().toString(36).substring(2, 6).toUpperCase();

        // Create order document
        const orderData = {
            user: user._id,
            products: orderProducts,
            totalAmount: totalPrice,
            totalDiscount: totalDiscount,
            platformFee: 20,
            shippingFee: 0,
            finalAmount: finalAmount,
            orderId: orderId,
            shippingAddress: {
                fullname: req.body.fullname || user.fullname || 'Customer',
                phone: req.body.phone || String(user.contact || ''),
                address: req.body.address || '',
                city: req.body.city || '',
                state: req.body.state || '',
                pincode: req.body.pincode || ''
            },
            paymentMethod: req.body.paymentMethod || 'cod',
            paymentStatus: 'pending',
            orderStatus: 'confirmed'
        };

        console.log("[ORDER] Creating order with orderId:", orderId);

        // Save order using create() for reliability
        const savedOrder = await orderModel.create(orderData);

        console.log("[ORDER] Order saved successfully! _id:", savedOrder._id);

        // Clear cart and add order to user
        user.cart = [];
        if (!user.orders) user.orders = [];
        user.orders.push(savedOrder._id);
        await user.save();

        console.log("[ORDER] User updated, cart cleared");

        res.redirect("/users/order-success/" + savedOrder._id);
    } catch (err) {
        console.error("Place order error:", err);
        res.redirect("/users/cart?error=" + encodeURIComponent(err.message));
    }
});

// Order success page
router.get("/order-success/:orderId", isLoggedIn, async function (req, res) {
    try {
        let order = await orderModel.findById(req.params.orderId);
        if (!order) {
            return res.redirect("/users/orders?error=Order not found");
        }
        res.render("order-success", { order });
    } catch (err) {
        res.redirect("/users/orders?error=" + encodeURIComponent(err.message));
    }
});

// User profile
router.get("/profile", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        res.render("profile", { user });
    } catch (err) {
        res.send(err.message);
    }
});

// Get recent orders (API endpoint)
router.get("/api/recent-orders", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        let orders = await orderModel.find({ user: user._id })
            .populate("products.product")
            .sort({ createdAt: -1 })
            .limit(5);
        res.json({ success: true, orders });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get order tracking (API endpoint)
router.get("/api/order/:orderId/track", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        let order = await orderModel.findOne({ _id: req.params.orderId, user: user._id })
            .populate("user", "fullname email")
            .populate("products.product");

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        // Get order timeline
        const timeline = getOrderTimeline(order);
        res.json({ success: true, order, timeline });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// User orders
router.get("/orders", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        // Fetch all orders for this user, sorted by newest first
        let orders = await orderModel.find({ user: user._id })
            .populate("products.product")
            .sort({ createdAt: -1 });
        res.render("orders", { orders });
    } catch (err) {
        res.send(err.message);
    }
});

// Order details
router.get("/orders/:orderId", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        let order = await orderModel.findOne({ _id: req.params.orderId, user: user._id });

        if (!order) {
            req.flash("error", "Order not found");
            return res.redirect("/users/orders");
        }

        res.render("order-detail", { order });
    } catch (err) {
        res.send(err.message);
    }
});

// User wishlist
router.get("/wishlist", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email }).populate("wishlist");
        res.render("wishlist", { wishlist: user.wishlist || [] });
    } catch (err) {
        res.send(err.message);
    }
});

// Add to wishlist
router.get("/wishlist/add/:productId", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        if (!user.wishlist.includes(req.params.productId)) {
            user.wishlist.push(req.params.productId);
            await user.save();
        }
        res.redirect("back");
    } catch (err) {
        res.redirect("/shop");
    }
});

// Remove from wishlist
router.get("/wishlist/remove/:productId", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        user.wishlist = user.wishlist.filter(id => id.toString() !== req.params.productId);
        await user.save();
        res.redirect("/users/wishlist");
    } catch (err) {
        res.redirect("/users/wishlist");
    }
});

// Move from wishlist to cart
router.get("/wishlist/move-to-cart/:productId", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        user.wishlist = user.wishlist.filter(id => id.toString() !== req.params.productId);
        if (!user.cart.includes(req.params.productId)) {
            user.cart.push(req.params.productId);
        }
        await user.save();
        res.redirect("/users/cart");
    } catch (err) {
        res.redirect("/users/wishlist");
    }
});

// ============ PROFILE & SETTINGS ============

// Update profile
router.post("/profile/update", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        user.fullname = req.body.fullname || user.fullname;
        user.contact = req.body.contact || user.contact;
        await user.save();
        req.flash("success", "Profile updated successfully");
        res.redirect("/users/profile");
    } catch (err) {
        req.flash("error", err.message);
        res.redirect("/users/profile");
    }
});

// Change password
router.post("/profile/change-password", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        const { currentPassword, newPassword, confirmPassword } = req.body;

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            req.flash("error", "Current password is incorrect");
            return res.redirect("/users/profile");
        }

        if (newPassword !== confirmPassword) {
            req.flash("error", "New passwords do not match");
            return res.redirect("/users/profile");
        }

        if (newPassword.length < 6) {
            req.flash("error", "Password must be at least 6 characters");
            return res.redirect("/users/profile");
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        req.flash("success", "Password changed successfully");
        res.redirect("/users/profile");
    } catch (err) {
        req.flash("error", err.message);
        res.redirect("/users/profile");
    }
});

// ============ ADDRESSES ============

// Get addresses
router.get("/addresses", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        res.render("addresses", { addresses: user.addresses || [] });
    } catch (err) {
        res.send(err.message);
    }
});

// Add address
router.post("/addresses/add", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        const newAddress = {
            fullname: req.body.fullname,
            phone: req.body.phone,
            address: req.body.address,
            city: req.body.city,
            state: req.body.state,
            pincode: req.body.pincode,
            isDefault: user.addresses.length === 0
        };
        user.addresses.push(newAddress);
        await user.save();
        res.redirect(req.body.redirect || "/users/addresses");
    } catch (err) {
        res.redirect("/users/addresses");
    }
});

// Set default address
router.get("/addresses/default/:addressId", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        user.addresses.forEach(addr => {
            addr.isDefault = addr._id.toString() === req.params.addressId;
        });
        await user.save();
        res.redirect("/users/addresses");
    } catch (err) {
        res.redirect("/users/addresses");
    }
});

// Delete address
router.get("/addresses/delete/:addressId", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        user.addresses = user.addresses.filter(addr => addr._id.toString() !== req.params.addressId);
        await user.save();
        res.redirect("/users/addresses");
    } catch (err) {
        res.redirect("/users/addresses");
    }
});

// ============ ORDER ACTIONS ============

// Cancel order
router.post("/orders/:orderId/cancel", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        let order = await orderModel.findOne({ _id: req.params.orderId, user: user._id });

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        // Can only cancel if order is pending or confirmed
        if (!['pending', 'confirmed'].includes(order.orderStatus)) {
            return res.status(400).json({ success: false, message: "Cannot cancel this order" });
        }

        order.orderStatus = 'cancelled';
        order.updatedAt = Date.now();
        await order.save();

        res.json({ success: true, message: "Order cancelled successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============ COUPONS ============

// Apply coupon
router.post("/apply-coupon", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        const { code, orderAmount } = req.body;

        const coupon = await couponModel.findOne({ code: code.toUpperCase() });
        if (!coupon) {
            return res.json({ success: false, message: "Invalid coupon code" });
        }

        const validation = coupon.isValid(user._id, orderAmount);
        if (!validation.valid) {
            return res.json({ success: false, message: validation.message });
        }

        const discount = coupon.calculateDiscount(orderAmount);

        res.json({
            success: true,
            discount: discount,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            message: `Coupon applied! You save ₹${discount}`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============ REVIEWS ============

// Add review
router.post("/products/:productId/review", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });
        let product = await productModel.findById(req.params.productId);

        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        // Check if user already reviewed
        const existingReview = product.reviews.find(r => r.user.toString() === user._id.toString());
        if (existingReview) {
            return res.status(400).json({ success: false, message: "You have already reviewed this product" });
        }

        product.reviews.push({
            user: user._id,
            rating: parseInt(req.body.rating),
            title: req.body.title,
            comment: req.body.comment
        });

        product.calculateAverageRating();
        await product.save();

        res.json({ success: true, message: "Review added successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============ RECENTLY VIEWED ============

// Track recently viewed (called from product detail page)
router.post("/track-view/:productId", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email });

        // Remove if already exists
        user.recentlyViewed = user.recentlyViewed.filter(
            item => item.product.toString() !== req.params.productId
        );

        // Add to beginning
        user.recentlyViewed.unshift({
            product: req.params.productId,
            viewedAt: Date.now()
        });

        // Keep only last 20
        user.recentlyViewed = user.recentlyViewed.slice(0, 20);

        await user.save();

        // Also update product view count
        await productModel.findByIdAndUpdate(req.params.productId, { $inc: { viewCount: 1 } });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// Get recently viewed
router.get("/recently-viewed", isLoggedIn, async function (req, res) {
    try {
        let user = await userModel.findOne({ email: req.user.email })
            .populate("recentlyViewed.product");
        res.json({ success: true, products: user.recentlyViewed });
    } catch (err) {
        res.status(500).json({ success: false, products: [] });
    }
});

module.exports = router;