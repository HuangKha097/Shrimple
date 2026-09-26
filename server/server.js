import express from "express";
import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import {connectDb} from "./src/libs/db.js";
import {protectedRoute} from "./src/middlewares/authMiddleware.js";

import authRoute from "./src/routes/authRoute.js";
import userRoute from "./src/routes/userRoute.js";
import friendRoute from "./src/routes/friendRoute.js";
import messageRoute from "./src/routes/messageRoute.js";
import conversationRoute from "./src/routes/conversationRoute.js";
import postRoute from "./src/routes/postRoute.js";
import notificationRoute from "./src/routes/notificationRoute.js";
import translationRoute from "./src/routes/translationRoute.js";

import { app, server } from "./src/socket/socket.js";

const PORT = process.env.PORT || 5001;
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGINS || "http://localhost:5173,https://shrimplechat.netlify.app")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: CLIENT_ORIGINS,
        credentials: true,
    })
);

// middlewares
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());
app.use("/public", express.static("public"));

// public routes
app.use("/api/auth", authRoute);

// private routes
app.use("/api/users", protectedRoute, userRoute);
app.use("/api/friends", protectedRoute, friendRoute);
app.use("/api/messages", protectedRoute, messageRoute);
app.use("/api/conversations", protectedRoute, conversationRoute);
app.use("/api/posts", protectedRoute, postRoute);
app.use("/api/notifications", protectedRoute, notificationRoute);
app.use("/api/translation", protectedRoute, translationRoute);

connectDb().then(() => {
    server.listen(PORT, () => {
        console.log(` Server is running at port: ${PORT}`);
    });
});
