const express = require("express");
const { body } = require("express-validator");
const validation = require("../../../middlewares/route-validation");

const {
    findProductMovementHistory
} = require("../../../controllers/admin/productMovement");

const router = express.Router();

router.get('/:productId/show-all', 
    findProductMovementHistory
)

module.exports = router;