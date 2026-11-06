
const { Products, ProductMovements, Users, Orders, OrderItems, Refunds} = require("../../models/Associations")
const errorHandler = require("../../util/errorHandler")
const parseQueryParams = require("../../util/parseQueryParams")
const {getStartOfToday, getCurrentDate, formatTimestamp} = require("../../util/formatTimestamp")
const moment = require('moment');

const { Op } = require("sequelize");

exports.approveRefund = async (req, res, next) => {
  const { userId } = req
  const { status} = req.body
  const { orderId } = req.params;

  try {
    const order = await Orders.findByPk(orderId);
    
    if (!order) {
        errorHandler(`Order not found`, 404);
    }

    const refundItems = await Refunds.findAll({
        where: {
            order_id: orderId, 
        }
    })

    if (!refundItems) {
        errorHandler(`Initiate a refund first`, 403);
    }

    if (refundItems[0].status != "pending") {
        errorHandler(`A refund was already intiated before`, 409);
    }

    let refundAmount;

    if (status == "approved"){
        await Promise.all(refundItems.map(async (item, index) => {
            const orderItem = await OrderItems.findOne({
                where: {
                    id: item.order_item_id,
                },
                include: [
                    {
                    model: Products,
                    as: "orderProduct",
                    attributes: ["id", "quantity"],
                    },
                ],
            })

            const productMovement = await ProductMovements.create({
                product_id: orderItem.product_id,
                change_quantity: item.refund_quantity,
                quantity_after_change: orderItem.orderProduct.quantity + item.refund_quantity,
                reason: "refund",
                order_id: orderId,
                refund_id: item.id,
                performed_by: refundItems[0].refunded_by,
                description: item.refund_reason
            })

            await orderItem.orderProduct.update({
                quantity: productMovement.quantity_after_change 
            })

            await orderItem.update({
                status:
                    orderItem.quantity > item.refund_quantity
                    ? "partially_refunded"
                    : "refunded",
                }
            );
        })
    );

    refundAmount = await Refunds.sum("refunded_amount", {
        where: { 
            order_id: orderId,
            status: ["approved", "pending"]
        }
    });

    await order.update({
        status: refundAmount === order.total_amount
            ? "refunded"
            : "partially_refunded",
        }
    );
    }

    await Promise.all(
        refundItems.map((refund) =>
            refund.update({
                status: "approved",
                approved_by: userId
            })
        )
    );

    return res.status(200).json({ status: true, refundAmount})
  } catch (err) {
    next(err)
  }
}

// Find all orders
exports.findAllOrders = async (req, res, next) => {
    const {employeeId, startDate, endDate} = req.query;

    try {
        if (employeeId) {
            const employee = await Users.findOne({where: {id: employeeId}})

            if (!employee) {
                errorHandler(`Employee id not found`, 404);
            }
        }

        const from = startDate
            ? moment(startDate).startOf("day").toDate()
            : getStartOfToday();

        const to = endDate
            ? moment(endDate).endOf("day").toDate()
            : getCurrentDate();

        const { where, limit, offset, order } = parseQueryParams(
            req,
            ["createdAt", "total_amount"],
            ["status", "payment_method"]
        )

        const allOrders = await Orders.findAll({
            where: {
                ...where,
                ...(employeeId && { employee_id: employeeId }),
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
                    as: 'orderCreatedBy',
                    attributes: ["id", "first_name", "last_name"]
                },
                {
                    model: Refunds,
                    as: 'orderRefund',
                    where: {status: "approved"},
                    attributes: ["id", "refunded_amount", ],
                    required: false
                }
            ],
            attributes: ["id", "employee_id", "customer_name", "total_amount", "payment_method", "status", "createdAt"],
        })

        const formattedOrders = allOrders.map((order) => {
            const data = order.toJSON();

            const {
                total_amount,
                orderRefund = [],
                createdAt,
                ...rest
            } = data;

            const formattedCreatedAt = formatTimestamp(createdAt);

            const totalRefunded = orderRefund.reduce(
                (sum, refund) => sum + Number(refund.refunded_amount),
                0
            );

            return {
                ...rest,
                createdAt: formattedCreatedAt,
                totalAmountBeforeRefund: Number(total_amount),
                totalRefunded,
                totalAmount: Number(total_amount) - totalRefunded,
            };
        });

        const totalSales = formattedOrders.reduce(
            (sum, order) => sum + order.totalAmountBeforeRefund,
            0
        );

        const totalRefunded = formattedOrders.reduce(
            (sum, order) => sum + order.totalRefunded,
            0
        );

        const netSales = totalSales - totalRefunded;

        return res.status(200).json({ 
            status: true, 
            details: {
                totalSales,
                totalRefunded,
                netSales,
            },
            orders: formattedOrders,
        })
    } catch (err) {
        next(err)
    }
}

exports.findOrderById = async (req, res, next) => {
  const { orderId } = req.params

  try {
    const order = await Orders.findOne({
      where: {
        id: orderId,
      },
      include: [
            {
                model: Users,
                as: 'orderCreatedBy',
                attributes: ["id", "first_name", "last_name"]
            },
            {
                model: Refunds,
                as: 'orderRefund',
                where: {status: "approved"},
                attributes: ["id", "approved_by", "order_item_id", "refunded_amount", "refund_quantity", "refund_reason", "status"],
                required: false
            },
            {
                model: OrderItems,
                as: 'orderItems',
                attributes: ["id", "quantity", "price_at_sale", "subtotal", "status"],
                include: [
                    {
                        model: Products,
                        as: 'orderProduct',
                        attributes: ["id", "name", "sku"],
                    }
                ]
            }
        ],
        attributes: ["id", "employee_id", "customer_name", "total_amount", "payment_method", "status", "createdAt"],
    })

    if (!order) {
      errorHandler("Order not found", 404)
    }

    const data = order.toJSON();

    const {
        total_amount,
        createdAt,
        orderItems = [],
        orderRefund = [],
        ...rest
    } = data;

    const formattedOrder = {
        ...rest,
        createdAt: formatTimestamp(createdAt),
        totalAmountBeforeRefund: Number(total_amount),
        totalRefunded: orderRefund.reduce(
            (sum, refund) => sum + Number(refund.refunded_amount),
            0
        ),
        totalAmount:
            Number(total_amount) -
            orderRefund.reduce(
                (sum, refund) => sum + Number(refund.refunded_amount),
                0
            ),

        orderItems: orderItems.map(item => {
            const refunds = orderRefund.filter(
                refund => refund.order_item_id === item.id
            );

            const refundedQuantity = refunds.reduce(
                (sum, refund) => sum + refund.refund_quantity,
                0
            );

            const refundedAmount = refunds.reduce(
                (sum, refund) => sum + Number(refund.refunded_amount),
                0
            );

            return {
                ...item,
                price_at_sale: Number(item.price_at_sale),
                subtotal: Number(item.subtotal),

                quantityPurchased: item.quantity,
                quantityRefunded: refundedQuantity,
                quantityRemaining: item.quantity - refundedQuantity,

                subtotalBeforeRefund: Number(item.subtotal),
                refundedAmount,
                subtotal: Number(item.subtotal) - refundedAmount,

                refunds
            };
        })
    };

    return res.status(200).json({ status: true, formattedOrder})
  } catch (err) {
    next(err)
  }
}

// Helper function for getting the total sales and refunds
async function getPaymentMethodSummary(paymentMethod, employeeId, from, to) {
    const sales = await Orders.sum("total_amount", {
        where: {
            payment_method: paymentMethod,
            ...(employeeId && { employee_id: employeeId }),
            createdAt: {
                [Op.between]: [from, to],
            },
        }
    });

    const refunds = await Refunds.sum("refunded_amount", {
        include: [{
            model: Orders,
            as: "refund",
            attributes: [],
            where: {
                payment_method: paymentMethod,
                ...(employeeId && { employee_id: employeeId }),
                createdAt: {
                    [Op.between]: [from, to],
                },
            }
        }],
        where: {
            status: "approved"
        }
    });

    return {
        paymentMethod,
        grossSales: Number(sales || 0),
        refunds: Number(refunds || 0),
        netSales: Number(sales || 0) - Number(refunds || 0)
    };
}

exports.getSaleSummary = async (req, res, next) => {
  const {employeeId, startDate, endDate} = req.query;

  try {
    const from = startDate
        ? moment(startDate).startOf("day").toDate()
        : getStartOfToday();

    const to = endDate
        ? moment(endDate).endOf("day").toDate()
        : getCurrentDate();

    const summary = await Promise.all([
        getPaymentMethodSummary("cash", employeeId, from, to),
        getPaymentMethodSummary("card", employeeId, from, to),
        getPaymentMethodSummary("e-wallet", employeeId, from, to),
    ]);

    const total = summary.reduce(
        (totals, item) => {
            totals.grossSales += item.grossSales;
            totals.refunds += item.refunds;
            totals.netSales += item.netSales;

            return totals;
        },
        {
            grossSales: 0,
            refunds: 0,
            netSales: 0,
        }
    );

    return res.status(200).json({ status: true, summary, total})
  } catch (err) {  
    next(err)
  }
}

