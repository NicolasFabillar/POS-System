const {Categories} = require("../../models/Associations")
const errorHandler = require("../../util/errorHandler")
const parseQueryParams = require("../../util/parseQueryParams")

exports.createCategory = async (req, res, next) => {
  const { name } = req.body

  try {
    const existingCategory = await Categories.findOne({
        where: {
            name : name
        }
    })

    if(existingCategory) {
        errorHandler("Category already exist", 409)
    }
    
    await Categories.create({
        name: name
    })

    return res.status(200).json({ status: true })
  } catch (err) {
    next(err)
  }
}

exports.updateCategory = async (req, res, next) => {
  const { categoryID } = req.params;
  const { name } = req.body

  try {
    const category = await Categories.findOne({
      where: {
        id: categoryID,
      },
    })

    if (!category) {
      errorHandler("Category not found", 404)
    }

    const existingCategory = await Categories.findOne({
      where: {
        id: name,
      },
    })

    if (existingCategory) {
      errorHandler("Category already exist", 409)
    }

    await category.update(
      {
        name: name,
      }
    )

    return res.status(200).json({ status: true })
  } catch (err) {
    next(err)
  }
}

exports.findAllCategories = async (req, res, next) => {
  try {
    const { where, limit, offset, order } = parseQueryParams(
      req,
      ["name"],
      ["name"]
    )

    const allCategories = await Categories.findAll({
      where,
      limit,
      offset,
      order,
      attributes: ["id", "name"],
    })

    return res.status(200).json({ status: true, allCategories })
  } catch (err) {
    next(err)
  }
}
