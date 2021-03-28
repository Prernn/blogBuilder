const path = require("path");
const fs = require("fs");
const express = require("express");
const debug = require("debug")("build:server");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const miscRoutes = require("./routes/miscRoutes");
const buildRoutes = require("./routes/buildRoutes");

// Create server
const app = express();

// ##──── middleware ────────────────────────────────────────────────────────────────────────
app.use(cookieParser());

// Setup cors
const corsOptions = { origin: "*" };
app.use(cors(corsOptions));

app.use(express.json()); // support JSON on all routes

// ##──── routes ────────────────────────────────────────────────────────────────────────────
app.use("/page", buildRoutes);

app.use("/", miscRoutes);

// const blogPostRenderer = new PageRender("blogPost.ejs");
// const homeRenderer = new PageRender("home.ejs");
// const menuRenderer= new PageRender("menu.ejs");

// Start the server 🚀
app.listen(process.env.PORT, async () => {
	debug(`app listening at http://localhost:${process.env.PORT}`);
});

// ##──── Error handling ────────────────────────────────────────────────────────────────────
// app.use((err, req, res, next) => {
// 	errorHandler(err, req, res, next);
// });
