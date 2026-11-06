const express = require("express");
const { body } = require("express-validator");
const validation = require("../../../middlewares/route-validation");

const {
    createCategory,
    updateCategory,
    findAllCategories
} = require("../../../controllers/admin/categories");

const router = express.Router();

router.post("/create",
    [
        body("name").notEmpty().isString(),
    ],
    validation,
    createCategory
);

router.put('/:categoryID/update', 
    [
        body("name").optional().isString(),
    ],
    validation,
    updateCategory
)

router.get('/show-all', 
    findAllCategories
)

module.exports = router;