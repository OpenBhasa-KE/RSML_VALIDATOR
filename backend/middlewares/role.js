const roleMiddleware = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            console.warn(`[Role] ${req.method} ${req.originalUrl} — user role "${req.user.role}" not in [${roles.join(', ')}]`);
            return res.status(403).json({ message: 'Access denied: Insufficient permissions' });
        }
        next();
    };
};

module.exports = roleMiddleware;
