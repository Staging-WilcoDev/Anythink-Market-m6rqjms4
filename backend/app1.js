require("dotenv").config();
var http = require("http"),
  path = require("path"),
  methods = require("methods"),
  express = require("express"),
  bodyParser = require("body-parser"),
  session = require("express-session"),
  cors = require("cors"),
  passport = require("passport"),
  errorhandler = require("errorhandler"),
  mongoose = require("mongoose");

var isProduction = process.env.NODE_ENV === "production";

// Create global app1 object
var app1 = express();

app1.use(cors());

// Normal express config defaults
app1.use(require("morgan")("dev"));
app1.use(bodyParser.urlencoded({ extended: false }));
app1.use(bodyParser.json());

app1.use(require("method-override")());
app1.use(express.static(__dirname + "/public"));

app1.use(
  session({
    secret: "secret",
    cookie: { maxAge: 60000 },
    resave: false,
    saveUninitialized: false
  })
);

if (!isProduction) {
  app1.use(errorhandler());
}

if (!process.env.MONGODB_URI) {
  console.warn("Missing MONGODB_URI in env, please add it to your .env file");
}

mongoose.connect(process.env.MONGODB_URI);
if (isProduction) {
} else {
  mongoose.set("debug", true);
}

require("./models/User");
require("./models/Item");
require("./models/Comment");
require("./config/passport");

app1.use(require("./routes"));

/// catch 404 and forward to error handler
app1.use(function (req, res, next) {
  if (req.url === "/favicon.ico") {
    res.writeHead(200, { "Content-Type": "image/x-icon" });
    res.end();
  } else {
    const err = new Error("Not Found");
    err.status = 404;
    next(err);
  }
});

/// error handler
app1.use(function(err, req, res, next) {
  console.log(err.stack);
  if (isProduction) {
    res.sendStatus(err.status || 500)
  } else {
    res.status(err.status || 500);
    res.json({
      errors: {
        message: err.message,
        error: err
      }
    });
  }
});

// finally, let's start our server...
var server = app1.listen(process.env.PORT || 3000, function() {
  console.log("Listening on port " + server.address().port);
});
