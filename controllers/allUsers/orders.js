
const { Products, ProductMovements, Users, Orders, OrderItems, Refunds} = require("../../models/Associations")
const errorHandler = require("../../util/errorHandler")
const parseQueryParams = require("../../util/parseQueryParams")
const { Op } = require("sequelize");
const moment = require('moment');
const {getStartOfToday, getCurrentDate, formatTimestamp} = require("../../util/formatTimestamp")

exports.createOrder = async (req, res, next) => {
  const { userId, userRole } = req
  const { customerName, orderItems} = req.body

  try {
    let totalAmount = 0;

    const products = await Promise.all(
        orderItems.map(async (order) => {
            const product = await Products.findOne({
                where: {
                    id: order.id,
                    quantity: {
                        [Op.gte]: order.quantity,
                    },
                },
            });

            if (!product) {
                errorHandler(`This product does not exist or has insufficient stock.`, 404, order);
            }

            const amount = product.price * order.quantity
            totalAmount += amount;

            return product;
        })
    );

    const createdOrder = await Orders.create(
        {
        employee_id: userId,
        customer_name: customerName,
        total_amount: totalAmount,
        status: "pending",

        orderItems: products.map((item, index) => ({
            product_id: item.id,
            quantity: orderItems[index].quantity,
            price_at_sale: item.price,
            subtotal: orderItems[index].quantity * item.price,
            status: "sold"
        })),
        },
        {
            include: [
            {
                model: OrderItems,
                as: "orderItems",
            },
            ],
        }
    )  

    await Promise.all(
        orderItems.map(async (order, index) => {
            await Products.decrement("quantity", {
                by: order.quantity,
                where: {
                    id: order.id
                }
            });

            await ProductMovements.create({
                product_id: order.id,
                change_quantity: order.quantity,
                quantity_after_change: products[index].quantity - order.quantity,
                reason: "sale",
                order_id: createdOrder.id,
                performed_by: userId,
            })
        })
    );

    const orderDetails = {orderId: createdOrder.id, totalAmount: createdOrder.total_amount, status: createdOrder.status}

    return res.status(200).json({ status: true, orderDetails})
  } catch (err) {
    next(err)
  }
}

exports.payOrder = async (req, res, next) => {
  const { userId, userRole } = req
  let { paymentMethod, amountTendered} = req.body
  const { orderId } = req.params;

  try {
    const order = await Orders.findByPk(orderId);
    
    if (!order) {
        errorHandler(`Order not found`, 404);
    }

    if (order.payment_method) {
        errorHandler(`Order is already payed`, 409);
    }

    let changeDue;

    if (paymentMethod == "cash") {
        if (!amountTendered) {
            errorHandler(`If payment is cash, please add amount tendered`, 409);
        }

        if (amountTendered < order.total_amount) {
            errorHandler(`Insufficient payment`, 409);
        }
        changeDue = amountTendered - order.total_amount;
    } else {
        amountTendered = null;
    }

    order.update({
        payment_method: paymentMethod,
        amount_tendered: amountTendered,
        change_due: changeDue,
        status: "completed"
    })

    return res.status(200).json({ status: true, changeDue})
  } catch (err) {
    next(err)
  }
}

exports.refundOrder = async (req, res, next) => {
  const { userId, userRole } = req
  const { customerName, refundItems, refundReason} = req.body
  const { orderId } = req.params;

  try {
    const order = await Orders.findByPk(orderId);
    
    if (!order) {
        errorHandler(`Order not found`, 404);
    }

    if (order.customer_name != customerName) {
        errorHandler(`Incorrect customer name`, 403);
    }

    if (order.status != "completed") {
        errorHandler(`You can only initiate refund once per order`, 403);
    }

    const refund = await Refunds.findOne({
        where: {
            order_id: orderId
        }
    })

    if (refund) {
        errorHandler(`Refund was already initiated for this order`, 403);
    }

    const orderItems = await Promise.all(
        refundItems.map(async (item) => {
            const orderItem = await OrderItems.findOne({
                where: {
                    product_id: item.id,
                    order_id: orderId,
                    quantity: {
                        [Op.gte]: item.quantity,
                    },
                },
                include: [
                    {
                    model: Products,
                    as: "orderProduct",
                    attributes: ["id", "quantity"],
                    },
                ],
            });

            if (!orderItem) {
                errorHandler(`Order item not found, please check the product id and make sure that the quantity is less than the original order`, 404, item);
            }

            if (orderItem.status != "sold") {
                errorHandler(`You can only initiate refund once per order`, 403);
            }

            return orderItem;
        })
    );

    await Promise.all(
        orderItems.map(async (item, index) => {
            const refundItem = await Refunds.create({
                order_id: orderId,
                order_item_id: item.id,
                refunded_by: userId,
                refund_quantity: refundItems[index].quantity,
                refund_reason: refundReason,
                refunded_amount: item.price_at_sale * refundItems[index].quantity
            })
        })
    );

    return res.status(200).json({ status: true, message: "Please have it approved first"})
  } catch (err) {  
    next(err)
  }
}

exports.refundAmount = async (req, res, next) => {
  const { userId, userRole } = req
  const { customerName, refundItems, refundReason} = req.body
  const { orderId } = req.params;

  try {
    const order = await Orders.findByPk(orderId);
    
    if (!order) {
        errorHandler(`Order not found`, 404);
    }

    const refund = await Refunds.findOne({
        where: {
            order_id: orderId
        }
    })

    if (!refund) {
        errorHandler(`Refund not found, please initiate one first`, 404);
    }

    if (refund.status == "pending") {
        errorHandler(`Refund not yet approved, please have it approved by an admin first`, 403);
    }

    if (refund.status == "rejected") {
        errorHandler(`Refund was rejected`, 403);
    }

    const refundAmount = await Refunds.sum("refunded_amount", {
        where: { 
            order_id: orderId,
            status: ["approved"]
        }
    });

    return res.status(200).json({ status: true, refundAmount})
  } catch (err) {  
    next(err)
  }
}

// Find all orders
exports.findAllOrdersCurrentUser = async (req, res, next) => {
    const { userId, userRole } = req
    const {startDate, endDate} = req.query;

    try {
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

        where.employee_id = userId;

       const allOrders = await Orders.findAll({
            where: {
                ...where,
                createdAt: {
                    [Op.between]: [from, to],
                },
            },
            limit,
            offset,
            order,
            include: [
                {
                    model: Refunds,
                    as: 'orderRefund',
                    where: { status: "approved" },
                    attributes: ["id", "refunded_amount"],
                    required: false
                }
            ],
            attributes: [
                "id",
                "employee_id",
                "customer_name",
                "total_amount",
                "payment_method",
                "status",
                "createdAt"
            ],
        });

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

        return res.status(200).json({ status: true, formattedOrders })
    } catch (err) {
        next(err)
    }
}

exports.findOrderById = async (req, res, next) => {
    const { userId } = req
  const { orderId } = req.params

  try {
    const order = await Orders.findOne({
      where: {
        id: orderId,
        employee_id: userId
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