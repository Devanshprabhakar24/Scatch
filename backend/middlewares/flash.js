// Custom flash middleware compatible with Express 5
module.exports = function flash() {
    return function (req, res, next) {
        if (req.flash) return next();

        req.flash = function (type, message) {
            if (!req.session) {
                return message ? undefined : [];
            }

            req.session.flash = req.session.flash || {};

            if (type && message) {
                // Set flash message
                req.session.flash[type] = req.session.flash[type] || [];
                req.session.flash[type].push(message);
                return undefined;
            } else if (type) {
                // Get flash messages
                const messages = req.session.flash[type] || [];
                delete req.session.flash[type];
                return messages;
            } else {
                // Get all flash messages
                const all = req.session.flash || {};
                req.session.flash = {};
                return all;
            }
        };

        next();
    };
};
