const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        console.warn(`[Auth] ${req.method} ${req.originalUrl} — no token provided`);
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        console.log(`[Auth] ${req.method} ${req.originalUrl} — authenticated as "${decoded.email || decoded.id}" (role: ${decoded.role})`);
        next();
    } catch (error) {
        console.warn(`[Auth] ${req.method} ${req.originalUrl} — invalid token: ${error.message}`);
        res.status(401).json({ message: 'Token is not valid' });
    }
};

module.exports = authMiddleware;
