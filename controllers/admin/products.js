
const { Products, Categories, ProductMovements, Users} = require("../../models/Associations")
const errorHandler = require("../../util/errorHandler")
const parseQueryParams = require("../../util/parseQueryParams")
const { Op, col, where: sequelizeWhere } = require("sequelize");

exports.createProduct = async (req, res, next) => {
  const { userId } = req
  const { name, sku, categoryId, description, quantity, lowStockThreshold, price } = req.body

  try {
    const existingProduct = await Products.findOne({
        where: {
          [Op.or]: [
            { name:  name},
            { sku: sku },
          ],
          status: {
            [Op.not]: "discontinued",
          }
        }
    })

    if(existingProduct) {
        errorHandler("Product already exist", 409)
    }
    
    const category = await Categories.findOne({
        where: {
            id: categoryId,
        }
    })

    if(!category) {
        errorHandler("Category does not exist", 404)
    }

    await Products.create({
      name: name,
      sku: sku,
      category_id: categoryId,
      description: description,
      quantity: quantity,
      low_stock_threshold: lowStockThreshold,
      created_by: userId,
      price: price,
    })

    return res.status(200).json({ status: true })
  } catch (err) {
    next(err)
  }
}

// This API should be used only for creating corrections on the product. For restocks and other stock movement use the appropriate API.
exports.updateProduct = async (req, res, next) => {
  const { productId } = req.params
  const { userId } = req
  const { name, sku, categoryId, description, quantity, lowStockThreshold, price, editReason } = req.body

  try {
    const product = await Products.findOne({
      where: {
        id: productId,
      },
    })

    if (!product) {
      errorHandler("Product not found", 404)
    }

    if (name && name != product.name) {
      const existingProduct = await Products.findOne({
        where: {
          [Op.and]: [
            { name : name },
            { status: { [Op.ne]: "discontinued" } },
            { id: { [Op.ne]: productId } },
          ],
        },
      })

      if (existingProduct) {
        errorHandler("Product name already exist", 409)
      }
    }

    if (sku && sku != product.sku ) {
      const existingProduct = await Products.findOne({
        where: {
          [Op.and]: [
            { name : name },
            { status: { [Op.ne]: "discontinued" } },
            { id: { [Op.ne]: productId } },
          ],
        },
      })

      if (existingProduct) {
        errorHandler("Product SKU already exists", 409)
      }
    }

    if (quantity && quantity != product.quantity) {
      changeQuantity = quantity - product.quantity;

      await ProductMovements.create({
        product_id: productId,
        change_quantity: changeQuantity,
        quantity_after_change: quantity,
        reason: "correction",
        description: editReason,
        performed_by: userId
      })
    }

    await product.update(
      {
        name: name || product.name,
        sku: sku || product.sku,
        category_id: categoryId || product.category_id,
        description: description || product.description,
        quantity: quantity || product.quantity,
        low_stock_threshold: lowStockThreshold || product.low_stock_threshold,
        price: price || product.price,
      }
    )

    return res.status(200).json({ status: true })
  } catch (err) {
    next(err)
  }
}

exports.deleteProduct = async (req, res, next) => {
  const { productId } = req.params

  try {
    const product = await Products.findOne({
      where: {
        id: productId,
      },
    })

    if (!product) {
      errorHandler("Product not found", 404)
    }

    await product.update(
      {
        status: "discontinued",
      }
    )

    return res.status(200).json({ status: true })
  } catch (err) {
    next(err)
  }
}

// Find all Products that are active or inactive
exports.findAllProducts = async (req, res, next) => {
  try {
    const { where, limit, offset, order } = parseQueryParams(
      req,
      ["name", "quantity"],
      ["name"]
    )

    const allProducts = await Products.findAll({
      where: {
        ...where,
        status: req.query.status || "active"
      },
      limit,
      offset,
      order,
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
      attributes: ["id", "name", "sku", "description", "quantity", "low_stock_threshold", "price", "status"],
    })

    return res.status(200).json({ status: true, allProducts })
  } catch (err) {
    next(err)
  }
}

exports.findProductById = async (req, res, next) => {
  const { productId } = req.params

  try {
    const product = await Products.findOne({
      where: {
        id: productId,
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
      attributes: ["id", "name", "sku", "description", "quantity", "low_stock_threshold", "price"],
    })

    if (!product) {
      errorHandler("Product not found", 404)
    }

    return res.status(200).json({ status: true, product })
  } catch (err) {
    next(err)
  }
}

// Find all Products that are active or inactive
exports.findLowStockProducts = async (req, res, next) => {
  try {
    const { where, limit, offset, order } = parseQueryParams(
      req,
      ["name", "quantity"],
      ["name"]
    )

    const lowStockProducts = await Products.findAll({
      where: {
        ...where,
        [Op.and]: [
            sequelizeWhere(col("quantity"), Op.lte, col("low_stock_threshold"))
        ],
        status: "active"
      },
      limit,
      offset,
      order,
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
      attributes: ["id", "name", "sku", "description", "quantity", "low_stock_threshold", "price"],
    })

    return res.status(200).json({ status: true, lowStockProducts })
  } catch (err) {
    next(err)
  }
}
