const mongoose = require("mongoose");

const couponSchema = mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true
    },
    description: String,
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        default: 'percentage'
    },
    discountValue: {
        type: Number,
        required: true
    },
    minOrderAmount: {
        type: Number,
        default: 0
    },
    maxDiscount: {
        type: Number,
        default: null
    },
    usageLimit: {
        type: Number,
        default: null
    },
    usedCount: {
        type: Number,
        default: 0
    },
    usedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    }],
    validFrom: {
        type: Date,
        default: Date.now
    },
    validUntil: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Check if coupon is valid
couponSchema.methods.isValid = function (userId, orderAmount) {
    const now = new Date();

    if (!this.isActive) return { valid: false, message: "Coupon is not active" };
    if (now < this.validFrom) return { valid: false, message: "Coupon is not yet valid" };
    if (now > this.validUntil) return { valid: false, message: "Coupon has expired" };
    if (this.usageLimit && this.usedCount >= this.usageLimit) return { valid: false, message: "Coupon usage limit reached" };
    if (orderAmount < this.minOrderAmount) return { valid: false, message: `Minimum order amount is ₹${this.minOrderAmount}` };
    if (userId && this.usedBy.includes(userId)) return { valid: false, message: "You have already used this coupon" };

    return { valid: true };
};

// Calculate discount
couponSchema.methods.calculateDiscount = function (orderAmount) {
    let discount = 0;

    if (this.discountType === 'percentage') {
        discount = (orderAmount * this.discountValue) / 100;
        if (this.maxDiscount && discount > this.maxDiscount) {
            discount = this.maxDiscount;
        }
    } else {
        discount = this.discountValue;
    }

    return Math.min(discount, orderAmount);
};

module.exports = mongoose.model("coupon", couponSchema);
