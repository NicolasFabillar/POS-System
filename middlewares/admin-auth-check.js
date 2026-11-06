const errorHandler = require("../util/errorHandler");

module.exports = async (req, res, next) => {
  try {
    const { userRole } = req;

    if (userRole != "Admin") {
        errorHandler("User is not an admin", 403)
    }

    next();
  } catch (err) {
    console.error(err);
    next(err);
  }
};