require("dotenv").config();

const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const multer = require("multer");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
app.use(express.static("public"));

/* =======================
   DATABASE CONNECTION
======================= */
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log("MongoDB Error:", err));

/* =======================
   IMAGE MODEL
======================= */
const imageSchema = new mongoose.Schema({
    filename: String,
    caption: String,
    userId: String,
    uploadTime: {
        type: Date,
        default: Date.now
    }
});

const Image = mongoose.model("Image", imageSchema);

/* =======================
   MIDDLEWARE
======================= */
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false
    })
);

app.use(passport.initialize());
app.use(passport.session());

/* =======================
   PASSPORT
======================= */
passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

/* =======================
   GOOGLE AUTH
======================= */
passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.CALLBACK_URL
        },
        (accessToken, refreshToken, profile, done) => {

            const user = {
                id: profile.id,
                displayName: profile.displayName,
                email: profile.emails?.[0]?.value || "",
                photo: profile.photos?.[0]?.value || ""
            };

            console.log("Google Login:", user.displayName);

            return done(null, user);
        }
    )
);

/* =======================
   AUTH ROUTES
======================= */
app.get(
    "/auth/google",
    passport.authenticate("google", {
        scope: ["profile", "email"]
    })
);

app.get(
    "/auth/google/callback",
    passport.authenticate("google", {
        failureRedirect: "/"
    }),
    (req, res) => {
        res.redirect("/dashboard.html");
    }
);

/* =======================
   LOGIN CHECK
======================= */
function isLoggedIn(req, res, next) {

    if (req.isAuthenticated()) {
        return next();
    }

    res.redirect("/");
}

const fs = require("fs");

const uploadPath = "public/uploads";

fs.mkdirSync(uploadPath, { recursive: true });

/* =======================
   MULTER CONFIG
======================= */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

/* =======================
   UPLOAD IMAGE
======================= */
app.post(
    "/upload",
    isLoggedIn,
    upload.single("image"),
    async (req, res) => {

        try {

            if (!req.file) {
                return res.send("No image selected");
            }

            await Image.create({
                filename: req.file.filename,
                caption: req.body.caption || "",
                userId: req.user.id
            });

            res.redirect("/dashboard.html");

        } catch (err) {

            console.log(err);
            res.status(500).send("Upload failed");
        }
    }
);

/* =======================
   GET IMAGES
======================= */
app.get("/images", async (req, res) => {

    try {

        const images = await Image.find()
        .sort({ uploadTime: -1 });

        res.json(images);

    } catch (err) {

        console.log(err);
        res.status(500).send("Error loading images");
    }
});

/* =======================
   USER API
======================= */
app.get("/user", (req, res) => {

    if (!req.user) {
        return res.json(null);
    }

    res.json({
        id: req.user.id,
        displayName: req.user.displayName,
        email: req.user.email,
        photo: req.user.photo
    });
});

/* =======================
   LOGOUT
======================= */
app.get("/logout", (req, res) => {

    req.logout(function(err) {

        if (err) {
            console.log(err);
        }

        res.redirect("/");
    });
});

/* =======================
   CLEAR ALL IMAGE RECORDS
======================= */
app.get("/clear-images", async (req, res) => {

    try {

        await Image.deleteMany({});

        res.send(
            "All image records removed from database"
        );

    } catch (err) {

        console.log(err);
        res.status(500).send("Error");
    }
});

/* =======================
   HOME PAGE
======================= */
app.get("/", (req, res) => {

    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});

/* =======================
   SERVER
======================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(
        `Server running on port ${PORT}`
    );
});