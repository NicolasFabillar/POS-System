const express = require("express");
const { body } = require("express-validator");
const validation = require("../../../middlewares/route-validation");

const {
    findAllProducts,
    findProductById,
    findProductBySKU,
} = require("../../../controllers/allUsers/products");

const router = express.Router();

router.get('/show-all', 
    findAllProducts
)

router.get('/:productId/search', 
    findProductById
)

router.get('/:sku/searchSKU', 
    findProductBySKU
)

module.exports = router;