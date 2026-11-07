function adminOwnerMiddleware(req, res, next) {
  if (!req.admin) {
    return res.status(401).json({
      message: "Admin authentication required.",
    });
  }

  if (req.admin.role !== "owner") {
    return res.status(403).json({
      message: "Only the Owner can manage administrators.",
    });
  }

  next();
}

module.exports = adminOwnerMiddleware;