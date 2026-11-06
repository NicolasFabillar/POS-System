const express = require("express");
const { body } = require("express-validator");
const validation = require("../../../middlewares/route-validation");

const {
    approveRefund,
    findAllOrders,
    findOrderById,
    getSaleSummary
} = require("../../../controllers/admin/orders");

const router = express.Router();

router.put('/:orderId/refund/approve', 
    [
        body("status").notEmpty().isString().isIn(["approved", "rejected"]),
    ],
    validation,
    approveRefund
)

router.get('/show-all', 
    findAllOrders
)

router.get('/:orderId/search', 
    findOrderById
)

router.get('/sales-summary', 
    getSaleSummary
)

module.exports = router;