require("dotenv").config();

const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const multer = require("multer");
const mongoose = require("mongoose");
const path = require("path");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const app = express();
app.use(express.static("public"));

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

/* =======================
   DATABASE CONNECTION
======================= */
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log("MongoDB Error:", err));

/* =======================
   SCHEMAS
======================= */
const imageSchema = new mongoose.Schema({
    imageUrl: String,
    publicId: String,       // FIX: store Cloudinary public_id for deletion
    caption: String,
    userId: String,
    uploadTime: {
        type: Date,
        default: Date.now
    }
});

const likeSchema = new mongoose.Schema({
    imageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Image",
        required: true
    },
    userId: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const commentSchema = new mongoose.Schema({
    imageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Image",
        required: true
    },
    userId: {
        type: String,
        required: true
    },
    userName: String,
    userPhoto: String,
    commentText: {
        type: String,
        required: true
    },
    // FIX: added parentCommentId for nested replies
    parentCommentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Comment",
        default: null
    },
    // FIX: added isEdited flag
    isEdited: {
        type: Boolean,
        default: false
    },
    // store whether comment author is admin at time of posting
    userIsAdmin: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// FIX: new schema for comment likes
const commentLikeSchema = new mongoose.Schema({
    commentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Comment",
        required: true
    },
    userId: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Image = mongoose.model("Image", imageSchema);
const Like = mongoose.model("Like", likeSchema);
const Comment = mongoose.model("Comment", commentSchema);
const CommentLike = mongoose.model("CommentLike", commentLikeSchema);

/* =======================
   ADMIN CONFIG
======================= */
const ADMIN_EMAIL = "aryanverma05694@gmail.com";

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
                photo: profile.photos?.[0]?.value || "",
                // FIX: expose isAdmin on user object
                isAdmin: profile.emails?.[0]?.value === ADMIN_EMAIL
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


/* =======================
   MULTER CONFIG
======================= */
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "kosmoquestt",
        allowed_formats: ["jpg", "jpeg", "png", "webp"]
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
               imageUrl: req.file.path,
               // FIX: save public_id for Cloudinary deletion later
               publicId: req.file.filename,
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
   IMAGE COUNT
======================= */
app.get("/image-count", async (req, res) => {

    try {

        const count = await Image.countDocuments();

        res.json({
            count
        });

    } catch (err) {

        res.status(500).json({
            count: 0
        });
    }
});

/* =======================
   DELETE IMAGE
======================= */
app.delete("/images/:id", isLoggedIn, async (req, res) => {

    try {
        const image = await Image.findById(req.params.id);

        if (!image) {
            return res.status(404).json({
                success: false,
                message: "Image not found"
            });
        }

        if (image.userId !== req.user.id && req.user.email !== ADMIN_EMAIL) {
            return res.status(403).json({
                success: false,
                message: "Not authorized"
            });
        }

        // FIX: delete from Cloudinary too
        if (image.publicId) {
            await cloudinary.uploader.destroy(image.publicId);
        }

        await Image.findByIdAndDelete(req.params.id);

        // Delete associated likes and comments
        await Like.deleteMany({ imageId: req.params.id });

        const comments = await Comment.find({ imageId: req.params.id });
        const commentIds = comments.map(c => c._id);
        await CommentLike.deleteMany({ commentId: { $in: commentIds } });
        await Comment.deleteMany({ imageId: req.params.id });

        res.json({
            success: true
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            success: false
        });
    }
});

/* =======================
   IMAGE LIKE ENDPOINTS
======================= */

// Add/Remove Like
app.post("/api/images/:id/like", isLoggedIn, async (req, res) => {
    try {
        const imageId = req.params.id;
        const userId = req.user.id;

        const existingLike = await Like.findOne({ imageId, userId });

        if (existingLike) {
            await Like.deleteOne({ imageId, userId });
            const likeCount = await Like.countDocuments({ imageId });
            return res.json({ liked: false, likeCount });
        } else {
            await Like.create({ imageId, userId });
            const likeCount = await Like.countDocuments({ imageId });
            return res.json({ liked: true, likeCount });
        }
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Like failed" });
    }
});

// Get Like Count
app.get("/api/images/:id/likes", async (req, res) => {
    try {
        const likeCount = await Like.countDocuments({ imageId: req.params.id });
        let userLiked = false;

        if (req.user) {
            const userLike = await Like.findOne({
                imageId: req.params.id,
                userId: req.user.id
            });
            userLiked = !!userLike;
        }

        res.json({ likeCount, userLiked });
    } catch (err) {
        console.log(err);
        res.status(500).json({ likeCount: 0, userLiked: false });
    }
});

/* =======================
   COMMENT ENDPOINTS
======================= */

// Add Comment (supports replies via parentCommentId)
app.post("/api/images/:id/comment", isLoggedIn, async (req, res) => {
    try {
        const { commentText, parentCommentId } = req.body;
        const imageId = req.params.id;

        if (!commentText || commentText.trim() === "") {
            return res.status(400).json({ error: "Comment cannot be empty" });
        }

        const comment = await Comment.create({
            imageId,
            userId: req.user.id,
            userName: req.user.displayName,
            userPhoto: req.user.photo,
            commentText,
            // FIX: save parentCommentId if it's a reply
            parentCommentId: parentCommentId || null,
            // store admin status of author at time of posting
            userIsAdmin: req.user.email === ADMIN_EMAIL
        });

        res.json(comment);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Comment failed" });
    }
});

// Get Comments (with like counts and userLiked)
app.get("/api/images/:id/comments", async (req, res) => {
    try {
        const comments = await Comment.find({ imageId: req.params.id })
            .sort({ createdAt: -1 });

        // FIX: attach likeCount and userLiked to each comment
        const enriched = await Promise.all(comments.map(async (c) => {
            const likeCount = await CommentLike.countDocuments({ commentId: c._id });
            let userLiked = false;
            if (req.user) {
                const ul = await CommentLike.findOne({ commentId: c._id, userId: req.user.id });
                userLiked = !!ul;
            }
            return {
                ...c.toObject(),
                likeCount,
                userLiked
            };
        }));

        res.json(enriched);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to load comments" });
    }
});

// FIX: Edit Comment (PUT)
app.put("/api/images/:imageId/comment/:commentId", isLoggedIn, async (req, res) => {
    try {
        const { commentId } = req.params;
        const { commentText } = req.body;

        if (!commentText || commentText.trim() === "") {
            return res.status(400).json({ error: "Comment cannot be empty" });
        }

        const comment = await Comment.findById(commentId);

        if (!comment) {
            return res.status(404).json({ error: "Comment not found" });
        }

        if (comment.userId !== req.user.id && req.user.email !== ADMIN_EMAIL) {
            return res.status(403).json({ error: "Not authorized" });
        }

        comment.commentText = commentText.trim();
        comment.isEdited = true;
        await comment.save();

        res.json(comment);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Edit failed" });
    }
});

// Delete Comment
app.delete("/api/images/:imageId/comment/:commentId", isLoggedIn, async (req, res) => {
    try {
        const { commentId } = req.params;
        const comment = await Comment.findById(commentId);

        if (!comment) {
            return res.status(404).json({ error: "Comment not found" });
        }

        if (comment.userId !== req.user.id && req.user.email !== ADMIN_EMAIL) {
            return res.status(403).json({ error: "Not authorized" });
        }

        // FIX: also delete replies and their likes when parent comment is deleted
        const replies = await Comment.find({ parentCommentId: commentId });
        const replyIds = replies.map(r => r._id);
        await CommentLike.deleteMany({ commentId: { $in: [...replyIds, commentId] } });
        await Comment.deleteMany({ parentCommentId: commentId });
        await Comment.findByIdAndDelete(commentId);

        res.json({ success: true });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Delete failed" });
    }
});

// FIX: Comment Like endpoint
app.post("/api/images/:imageId/comment/:commentId/like", isLoggedIn, async (req, res) => {
    try {
        const { commentId } = req.params;
        const userId = req.user.id;

        const existing = await CommentLike.findOne({ commentId, userId });

        if (existing) {
            await CommentLike.deleteOne({ commentId, userId });
            const likeCount = await CommentLike.countDocuments({ commentId });
            return res.json({ liked: false, likeCount });
        } else {
            await CommentLike.create({ commentId, userId });
            const likeCount = await CommentLike.countDocuments({ commentId });
            return res.json({ liked: true, likeCount });
        }
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Comment like failed" });
    }
});

/* =======================
   USER API
======================= */
app.get("/user", (req, res) => {

    if (!req.user) {
        return res.json(null);
    }

    // FIX: include isAdmin in response
    res.json({
        id: req.user.id,
        displayName: req.user.displayName,
        email: req.user.email,
        photo: req.user.photo,
        isAdmin: req.user.email === ADMIN_EMAIL
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
        await Like.deleteMany({});
        await Comment.deleteMany({});
        await CommentLike.deleteMany({});

        res.send(
            "All image records removed from database"
        );

    } catch (err) {

        console.log(err);
        res.status(500).send("Error");
    }
});

/* =======================
   NASA APOD PROXY
   Add to .env: NASA_API_KEY=your_key
======================= */
app.get("/api/apod", async (req, res) => {
    try {
        const response = await fetch(
            `https://api.nasa.gov/planetary/apod?api_key=${process.env.NASA_API_KEY}`
        );

        if (!response.ok) {
            return res.status(response.status).json({ error: "NASA API error" });
        }

        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.log("APOD error:", err);
        res.status(500).json({ error: "Failed to fetch APOD" });
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