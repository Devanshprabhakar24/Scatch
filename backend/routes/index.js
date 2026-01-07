const express = require('express');
const router = express.Router();
const isLoggedIn = require('../middlewares/isLoggedIn');
const productModel = require('../models/product-model');

router.get('/', (req, res) => {
    let error = req.flash("error");
    res.render("index", { error });

});

router.get("/shop", isLoggedIn, async function (req, res) {
    let { sortby, filter } = req.query;
    let query = {};
    let sortOption = {};

    // Apply filters
    if (filter === 'discounted') {
        query.discount = { $gt: 0 };
    }

    // Apply sorting
    if (sortby === 'newest') {
        sortOption = { _id: -1 };
    } else if (sortby === 'lowprice') {
        sortOption = { price: 1 };
    } else if (sortby === 'highprice') {
        sortOption = { price: -1 };
    }

    let products = await productModel.find(query).sort(sortOption);
    let success = req.flash("success");
    res.render("shop", { products, success, sortby: sortby || 'popular' });
});

// About page
router.get("/about", (req, res) => {
    res.render("about");
});

// Contact page
router.get("/contact", (req, res) => {
    res.render("contact");
});

// Search page
router.get("/search", isLoggedIn, async (req, res) => {
    let { q } = req.query;
    let results = [];

    if (q) {
        results = await productModel.find({
            name: { $regex: q, $options: 'i' }
        });
    }

    res.render("search", { query: q || '', results });
});

// Product detail page
router.get("/product/:id", isLoggedIn, async (req, res) => {
    try {
        let product = await productModel.findById(req.params.id);
        if (!product) {
            return res.status(404).render("404");
        }
        res.render("product-detail", { product });
    } catch (err) {
        res.status(404).render("404");
    }
});


module.exports = router;