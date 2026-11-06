const express = require("express");
const { body } = require("express-validator");
const validation = require("../../../middlewares/route-validation");

const {
    showAllUsers,
    findUserById,
} = require("../../../controllers/admin/accounts");

const router = express.Router();

router.get('/show-all', 
    showAllUsers
)

router.get('/:userId/search', 
    findUserById
)


module.exports = router;