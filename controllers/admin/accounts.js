const { Users} = require("../../models/Associations")
const errorHandler = require("../../util/errorHandler")
const parseQueryParams = require("../../util/parseQueryParams")
const moment = require('moment');

const { Op } = require("sequelize");

exports.showAllUsers = async (req, res, next) => {
  try {
    const { where, limit, offset, order } = parseQueryParams(
        req,
        ["role", "first_name", "last_name"],
        ["first_name", "last_name", "role"]
    )

    const allUsers = await Users.findAll({
        where: {
            ...where,
            status: true
        },
        limit,
        offset,
        order,
        attributes: ["id", "role", "first_name", "last_name", "username", "phone_no", "email_address"],
    })


    return res.status(200).json({ status: true, allUsers})
  } catch (err) {
    next(err)
  }
}

exports.findUserById = async (req, res, next) => {
  const { userId } = req.params;

  try {
    const user = await Users.findOne({
        where: {
            id: userId
        },
        attributes: ["id", "role", "first_name", "last_name", "username", "phone_no", "email_address"],
    })


    return res.status(200).json({ status: true, user})
  } catch (err) {
    next(err)
  }
}