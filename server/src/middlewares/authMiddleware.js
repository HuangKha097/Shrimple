import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protectedRoute = async (req, res, next) => {
    try {
        const authHeader = req.headers["authorization"];
        const token = authHeader && authHeader.split(" ")[1];

        if (!token) {
            return res.status(401).json({message: "Cannot find access token"});
        }

        jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, async (err, decodedUser) => {
            if (err) {
                console.error("JWT Verification Error:", err.message); // Log exact error
                return res.status(403).json({message: "Access token is expired or not correct"});
            }
            const user = await User.findById(decodedUser.userId).select("-password");

            if (!user) {
                return res.status(404).json({message: "User does not exist"});
            }
            req.user = user;
            next();
        });

    } catch (error) {
        console.error("JWT auth error:", error);
        return res.status(500).json({message: "Invalid or expired token"});
    }
};
