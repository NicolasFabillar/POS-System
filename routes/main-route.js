const express = require("express");
const router = express.Router();

const isAuth = require("../middlewares/authorization");
const isAdmin = require("../middlewares/admin-auth-check");

// admin
const adminAccountsRoute = require("./admin/accounts/accounts");
const adminCategoriesRoute = require("./admin/categories/categories");
const adminProductsRoute = require("./admin/products/products");
const adminProductMovementsRoute = require("./admin/products/productMovements");
const adminOrdersRoute = require("./admin/orders/orders");

router.use("/admin", isAuth, isAdmin, adminAccountsRoute);
router.use("/admin/categories",isAuth, isAdmin, adminCategoriesRoute);
router.use("/admin/products", isAuth, isAdmin, adminProductsRoute);
router.use("/admin/products/product-movement", isAuth, isAdmin, adminProductMovementsRoute);
router.use("/admin/orders", isAuth, isAdmin, adminOrdersRoute);

// all users
const allAccountsRoute = require("./allUsers/accounts/accounts");
const allOrdersRoute = require("./allUsers/orders/orders");
const allProductsRoute = require("./allUsers/products/products");

router.use("/all", allAccountsRoute);
router.use("/all/orders", isAuth, allOrdersRoute);
router.use("/all/products", isAuth, allProductsRoute);

module.exports = router;
