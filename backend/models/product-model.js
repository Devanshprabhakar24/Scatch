const mongoose = require("mongoose");

const productSchema = mongoose.Schema({
    image: Buffer,
    name: String,
    price: Number,
    discount: {
        type: Number,
        default: 0
    },
    description: {
        type: String,
        default: "Experience premium quality with this exceptional product. Crafted with attention to detail and designed for those who appreciate the finer things in life."
    },
    features: {
        type: [String],
        default: [
            "Premium quality materials",
            "Ergonomic design for comfort",
            "Water-resistant coating",
            "Multiple compartments for organization"
        ]
    },
    // Stock status
    inStock: {
        type: Boolean,
        default: true
    },
    stockQuantity: {
        type: Number,
        default: 100
    },
    // Shipping info
    freeShipping: {
        type: Boolean,
        default: true
    },
    freeShippingMinOrder: {
        type: Number,
        default: 500
    },
    deliveryDays: {
        type: String,
        default: "5-7"
    },
    expressDeliveryDays: {
        type: String,
        default: "2-3"
    },
    // Return policy
    returnDays: {
        type: Number,
        default: 30
    },
    warrantyYears: {
        type: Number,
        default: 1
    },
    // Colors
    bgcolor: String,
    panelcolor: String,
    textcolor: String
}, {
    timestamps: true
});

module.exports = mongoose.model("product", productSchema);