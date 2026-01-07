const express = require("express");
const router = express.Router();
const isLoggedIn = require("../middlewares/isLoggedIn");
const userModel = require("../models/user-model");
const productModel = require("../models/product-model");
const orderModel = require("../models/order-model");
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
        console.log("=== PLACE ORDER START ===");
        console.log("User email:", req.user?.email);
        console.log("Request body:", JSON.stringify(req.body));

        if (!req.user || !req.user.email) {
            console.log("ERROR: No user in request");
            return res.redirect("/?error=Please login to place an order");
        }

        let user = await userModel.findOne({ email: req.user.email });

        if (!user) {
            console.log("ERROR: User not found in database");
            return res.redirect("/?error=User not found");
        }

        console.log("User found:", user._id);

        if (!user.cart || user.cart.length === 0) {
            console.log("ERROR: Cart is empty");
            return res.redirect("/users/cart?error=Your cart is empty");
        }

        console.log("Cart items count:", user.cart.length);

        // Fetch products from cart
        let cartProducts = await productModel.find({ _id: { $in: user.cart } });

        if (!cartProducts || cartProducts.length === 0) {
            console.log("ERROR: No products found for cart items");
            return res.redirect("/users/cart?error=Products not found");
        }

        console.log("Products found count:", cartProducts.length);

        // Calculate totals
        let totalPrice = 0;
        let totalDiscount = 0;
        cartProducts.forEach(product => {
            totalPrice += product.price || 0;
            totalDiscount += product.discount || 0;
        });

        const finalAmount = totalPrice - totalDiscount + 20;
        console.log("Totals - Price:", totalPrice, "Discount:", totalDiscount, "Final:", finalAmount);

        // Create order products array with details
        const orderProducts = cartProducts.map(product => ({
            product: product._id,
            name: product.name,
            price: product.price,
            discount: product.discount || 0,
            image: product.image,
            bgcolor: product.bgcolor
        }));

        // Generate order ID
        const orderId = 'ORD' + Date.now() + Math.random().toString(36).substring(2, 7).toUpperCase();
        console.log("Generated orderId:", orderId);

        // Prepare order data
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
                phone: req.body.phone || (user.contact ? String(user.contact) : '0000000000'),
                address: req.body.address || 'Not provided',
                city: req.body.city || 'Not provided',
                state: req.body.state || 'Not provided',
                pincode: req.body.pincode || '000000'
            },
            paymentMethod: req.body.paymentMethod || 'cod',
            paymentStatus: 'pending',
            orderStatus: 'confirmed'
        };

        console.log("Order data prepared, creating order...");

        // Create the order
        const order = new orderModel(orderData);
        const savedOrder = await order.save();

        console.log("=== ORDER SAVED SUCCESSFULLY ===");
        console.log("Order _id:", savedOrder._id);
        console.log("Order orderId:", savedOrder.orderId);

        // Update user - add order and clear cart
        await userModel.findByIdAndUpdate(user._id, {
            $push: { orders: savedOrder._id },
            $set: { cart: [] }
        });

        console.log("User updated, cart cleared");
        console.log("=== PLACE ORDER END - SUCCESS ===");

        // Redirect to order success page
        res.redirect("/users/order-success/" + savedOrder._id);
    } catch (err) {
        console.error("=== PLACE ORDER ERROR ===");
        console.error("Error name:", err.name);
        console.error("Error message:", err.message);
        console.error("Error stack:", err.stack);
        if (err.errors) {
            console.error("Validation errors:", JSON.stringify(err.errors));
        }
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
        // For now, wishlist is empty - can be extended later
        res.render("wishlist", { wishlist: [] });
    } catch (err) {
        res.send(err.message);
    }
});

module.exports = router;