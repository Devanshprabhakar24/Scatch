const userModel = require("../models/user-model");
const bcrypt = require('bcrypt');
const { generateToken } = require("../utils/generateToken");



module.exports.registerUser = async function (req, res) {
    try {
        const { email, password, fullname } = req.body;
        if (!email || !password || !fullname) {
            req.flash("error", "Email, password and fullname are required");
            return res.redirect("/");
        }
        let user = await userModel.findOne({ email: email })
        if (user) {
            req.flash("error", "User already exists. Please login instead.");
            return res.redirect("/");
        }

        bcrypt.genSalt(10, function (err, salt) {
            bcrypt.hash(password, salt, async function (err, hash) {
                if (err) {
                    req.flash("error", "Registration failed. Please try again.");
                    return res.redirect("/");
                }
                else {
                    let user = await userModel.create({
                        email,
                        password: hash,
                        fullname
                    })
                    const token = generateToken(user);
                    const isProd = process.env.NODE_ENV === 'production';
                    res.cookie("token", token, {
                        httpOnly: true,
                        secure: isProd,
                        sameSite: isProd ? 'lax' : 'lax',
                        maxAge: 7 * 24 * 60 * 60 * 1000,
                        path: '/'
                    });
                    res.redirect("/shop")
                }
            })
        })
    } catch (err) {
        console.error(err);
        req.flash("error", "An error occurred. Please try again.");
        return res.redirect("/");
    }
}
module.exports.loginUser = async function (req, res) {
    try {
        let { email, password } = req.body;
        let user = await userModel.findOne({ email: email })
        if (!user) {
            req.flash("error", "Email or password is incorrect");
            return res.redirect("/");
        }
        bcrypt.compare(password, user.password, function (err, result) {
            if (err) {
                console.error(err);
                req.flash("error", "Login failed. Please try again.");
                return res.redirect("/");
            }
            if (result) {
                const token = generateToken(user);
                const isProd = process.env.NODE_ENV === 'production';
                res.cookie("token", token, {
                    httpOnly: true,
                    secure: isProd,
                    sameSite: isProd ? 'lax' : 'lax',
                    maxAge: 7 * 24 * 60 * 60 * 1000,
                    path: '/'
                });
                res.redirect("/shop");
            }
            else {
                req.flash("error", "Email or password is incorrect");
                return res.redirect("/");
            }
        })
    } catch (err) {
        console.error(err);
        req.flash("error", "An error occurred. Please try again.");
        return res.redirect("/");
    }
}

module.exports.logout = function (req, res) {
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie("token", "", {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'lax' : 'lax',
        expires: new Date(0),
        path: '/'
    });
    res.redirect("/");
}
