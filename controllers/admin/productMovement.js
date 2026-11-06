const { Products, ProductMovements, Users, Categories} = require("../../models/Associations")
const errorHandler = require("../../util/errorHandler")
const parseQueryParams = require("../../util/parseQueryParams")
const { Op } = require("sequelize");
const {getStartOfToday, getCurrentDate, formatTimestamp} = require("../../util/formatTimestamp")
const moment = require('moment');

// Find all the changes in a specific product history
exports.findProductMovementHistory = async (req, res, next) => {
    const { productId } = req.params;
    const {employeeId, startDate, endDate} = req.query;

    try {
        const from = startDate
            ? moment(startDate).startOf("day").toDate()
            : getStartOfToday();

        const to = endDate
            ? moment(endDate).endOf("day").toDate()
            : getCurrentDate();

        const product = await Products.findOne({
            where: {
                id: productId
            },
            include: [
                {
                    model: Users,
                    as: 'productCreator',
                    attributes: ["id", "first_name", "last_name"]
                },
                {
                    model: Categories,
                    as: 'category',
                    attributes: ["id", "name"]
                }
            ],
            attributes: ["id", "name", "sku", "description", "quantity", "low_stock_threshold", "price"]

        })

        if (!product) {
            errorHandler("Product not found", 404)
        }

        const { where, limit, offset, order } = parseQueryParams(
            req,
            ["createdAt", "change_amount"],
            ["reason"],
        )

        const productMovements = await ProductMovements.findAll({
            where: {
                ...where,
                ...(employeeId && { performed_by: employeeId }),
                product_id: productId,
                createdAt: {
                    [Op.between]: [from, to],
                },
            },
            limit,
            offset,
            order,
            include: [
                {
                    model: Users,
                    as: 'performedBy',
                    attributes: ["id", "first_name", "last_name"]
                },
                {
                    model: Products,
                    as: 'changedProduct',
                    attributes: ["id", "name"]
                },

            ],
            attributes: ["id", "change_quantity", "quantity_after_change", "reason", "description","createdAt"],
        })

        return res.status(200).json({ status: true, product, productMovements })
    } catch (err) {
        next(err)
    }
}
