import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const verifyToken = async (req, res, next) => {
  const bearer = req.headers.authorization;
  if (!bearer?.startsWith("Bearer "))
    return res.status(401).json({ msg: "No token" });

  const token = bearer.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
    next();
  } catch {
    res.status(401).json({ msg: "Token invalid" });
  }
};
