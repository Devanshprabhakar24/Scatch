const express = require('express');
const router = express.Router();
const isLoggedIn = require('../middlewares/isLoggedIn');
const productModel = require('../models/product-model');
const userModel = require('../models/user-model');

router.get('/', async (req, res) => {
    let error = req.flash("error");

    // Get featured products, flash sales, and new arrivals for homepage
    let flashSaleProducts = await productModel.find({
        isFlashSale: true,
        flashSaleEndTime: { $gt: new Date() }
    }).limit(4);

    let newArrivals = await productModel.find().sort({ createdAt: -1 }).limit(8);
    let topRated = await productModel.find({ averageRating: { $gte: 4 } }).limit(4);

    res.render("index", { error, flashSaleProducts, newArrivals, topRated });
});

router.get("/shop", isLoggedIn, async function (req, res) {
    let { sortby, filter, category, minPrice, maxPrice, rating, search } = req.query;
    let query = {};
    let sortOption = {};

    // Apply filters
    if (filter === 'discounted') {
        query.discount = { $gt: 0 };
    }

    // Category filter
    if (category && category !== 'all') {
        query.category = category;
    }

    // Price range filter
    if (minPrice || maxPrice) {
        query.price = {};
        if (minPrice) query.price.$gte = parseInt(minPrice);
        if (maxPrice) query.price.$lte = parseInt(maxPrice);
    }

    // Rating filter
    if (rating) {
        query.averageRating = { $gte: parseInt(rating) };
    }

    // Search filter
    if (search) {
        query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { tags: { $in: [new RegExp(search, 'i')] } }
        ];
    }

    // Apply sorting
    if (sortby === 'newest') {
        sortOption = { createdAt: -1 };
    } else if (sortby === 'lowprice') {
        sortOption = { price: 1 };
    } else if (sortby === 'highprice') {
        sortOption = { price: -1 };
    } else if (sortby === 'rating') {
        sortOption = { averageRating: -1 };
    } else if (sortby === 'bestselling') {
        sortOption = { soldCount: -1 };
    }

    let products = await productModel.find(query).sort(sortOption);

    // Get all categories for filter sidebar
    let categories = await productModel.distinct('category');

    // Get price range for filter
    let priceRange = await productModel.aggregate([
        { $group: { _id: null, minPrice: { $min: '$price' }, maxPrice: { $max: '$price' } } }
    ]);

    let success = req.flash("success");
    res.render("shop", {
        products,
        success,
        sortby: sortby || 'popular',
        categories,
        priceRange: priceRange[0] || { minPrice: 0, maxPrice: 10000 },
        filters: { category, minPrice, maxPrice, rating, search }
    });
});

// About page
router.get("/about", (req, res) => {
    res.render("about");
});

// Contact page
router.get("/contact", (req, res) => {
    res.render("contact");
});

// Search page with autocomplete support
router.get("/search", isLoggedIn, async (req, res) => {
    let { q, category, minPrice, maxPrice, rating } = req.query;
    let query = {};

    if (q) {
        query.$or = [
            { name: { $regex: q, $options: 'i' } },
            { description: { $regex: q, $options: 'i' } },
            { tags: { $in: [new RegExp(q, 'i')] } }
        ];
    }

    if (category && category !== 'all') query.category = category;
    if (minPrice) query.price = { ...query.price, $gte: parseInt(minPrice) };
    if (maxPrice) query.price = { ...query.price, $lte: parseInt(maxPrice) };
    if (rating) query.averageRating = { $gte: parseInt(rating) };

    let results = await productModel.find(query).limit(50);
    let categories = await productModel.distinct('category');

    res.render("search", {
        query: q || '',
        results,
        categories,
        filters: { category, minPrice, maxPrice, rating }
    });
});

// Search autocomplete API
router.get("/api/search/autocomplete", async (req, res) => {
    let { q } = req.query;
    if (!q || q.length < 2) {
        return res.json({ suggestions: [] });
    }

    let products = await productModel.find({
        $or: [
            { name: { $regex: q, $options: 'i' } },
            { tags: { $in: [new RegExp(q, 'i')] } }
        ]
    }).select('name category').limit(10);

    let suggestions = products.map(p => ({
        name: p.name,
        category: p.category
    }));

    // Add category suggestions
    let categories = await productModel.distinct('category', {
        category: { $regex: q, $options: 'i' }
    });

    categories.forEach(cat => {
        suggestions.push({ name: cat, type: 'category' });
    });

    res.json({ suggestions: suggestions.slice(0, 10) });
});

// Product detail page with recently viewed tracking
router.get("/product/:id", isLoggedIn, async (req, res) => {
    try {
        let product = await productModel.findById(req.params.id).populate('reviews.user', 'fullname');
        if (!product) {
            return res.status(404).render("404");
        }

        // Increment view count
        product.viewCount = (product.viewCount || 0) + 1;
        await product.save();

        // Track recently viewed for logged in user
        if (req.user) {
            await userModel.findByIdAndUpdate(req.user._id, {
                $pull: { recentlyViewed: { product: product._id } }
            });
            await userModel.findByIdAndUpdate(req.user._id, {
                $push: {
                    recentlyViewed: {
                        $each: [{ product: product._id }],
                        $position: 0,
                        $slice: 20
                    }
                }
            });
        }

        // Get related products
        let relatedProducts = await productModel.find({
            category: product.category,
            _id: { $ne: product._id }
        }).limit(4);

        // Get user's wishlist to check if product is in wishlist
        let isInWishlist = false;
        if (req.user) {
            let user = await userModel.findById(req.user._id);
            isInWishlist = user.wishlist.some(id => id.toString() === product._id.toString());
        }

        res.render("product-detail", { product, relatedProducts, isInWishlist });
    } catch (err) {
        console.error(err);
        res.status(404).render("404");
    }
});

// Flash sale products page
router.get("/flash-sale", isLoggedIn, async (req, res) => {
    let products = await productModel.find({
        isFlashSale: true,
        flashSaleEndTime: { $gt: new Date() }
    });

    res.render("flash-sale", { products });
});

// Product recommendations based on user's activity
router.get("/api/recommendations", isLoggedIn, async (req, res) => {
    try {
        let user = await userModel.findById(req.user._id).populate('recentlyViewed.product');

        // Get categories from recently viewed
        let viewedCategories = user.recentlyViewed
            .filter(rv => rv.product)
            .map(rv => rv.product.category);

        // Get products from same categories
        let recommendations = await productModel.find({
            category: { $in: viewedCategories },
            _id: { $nin: user.recentlyViewed.map(rv => rv.product?._id).filter(Boolean) }
        }).sort({ averageRating: -1, soldCount: -1 }).limit(8);

        // If not enough recommendations, get top rated products
        if (recommendations.length < 8) {
            let topRated = await productModel.find({
                _id: { $nin: recommendations.map(r => r._id) }
            }).sort({ averageRating: -1 }).limit(8 - recommendations.length);
            recommendations = [...recommendations, ...topRated];
        }

        res.json({ recommendations });
    } catch (err) {
        res.status(500).json({ error: 'Failed to get recommendations' });
    }
});


module.exports = router;