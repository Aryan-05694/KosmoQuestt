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

// FIX: New Admin schema for flexible admin management
const adminSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    displayName: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const imageSchema = new mongoose.Schema({
    imageUrl: String,
    publicId: String,       // store Cloudinary public_id for deletion
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
    parentCommentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Comment",
        default: null
    },
    isEdited: {
        type: Boolean,
        default: false
    },
    // FIX: store whether comment author is admin at time of posting
    userIsAdmin: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

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
const Admin = mongoose.model("Admin", adminSchema);

/* =======================
   HELPER FUNCTIONS
======================= */

// Check if user is admin (queries database)
async function isUserAdmin(userId) {
    try {
        const admin = await Admin.findOne({ userId });
        return !!admin;
    } catch (err) {
        console.log("Error checking admin status:", err);
        return false;
    }
}

// Add user as admin
async function makeUserAdmin(userId, email, displayName) {
    try {
        const existingAdmin = await Admin.findOne({ userId });
        if (existingAdmin) {
            return { success: false, message: "User is already an admin" };
        }

        await Admin.create({
            userId,
            email,
            displayName
        });

        return { success: true, message: "User promoted to admin" };
    } catch (err) {
        console.log("Error making user admin:", err);
        return { success: false, message: "Error promoting user" };
    }
}

// Remove user as admin
async function removeUserAdmin(userId) {
    try {
        const result = await Admin.findOneAndDelete({ userId });
        if (!result) {
            return { success: false, message: "User is not an admin" };
        }
        return { success: true, message: "User removed from admin" };
    } catch (err) {
        console.log("Error removing admin:", err);
        return { success: false, message: "Error removing admin" };
    }
}

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
        async (accessToken, refreshToken, profile, done) => {
            // FIX: Check admin status from database instead of hardcoded email
            const isAdmin = await isUserAdmin(profile.id);

            const user = {
                id: profile.id,
                displayName: profile.displayName,
                email: profile.emails?.[0]?.value || "",
                photo: profile.photos?.[0]?.value || "",
                isAdmin: isAdmin
            };

            console.log("Google Login:", user.displayName, "Admin:", user.isAdmin);

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

        // FIX: Check admin status from database
        const isAdmin = await isUserAdmin(req.user.id);
        if (image.userId !== req.user.id && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Not authorized"
            });
        }

        // delete from Cloudinary too
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

        // FIX: Check admin status from database
        const isAdmin = await isUserAdmin(req.user.id);

        const comment = await Comment.create({
            imageId,
            userId: req.user.id,
            userName: req.user.displayName,
            userPhoto: req.user.photo,
            commentText,
            parentCommentId: parentCommentId || null,
            // FIX: store admin status from database check
            userIsAdmin: isAdmin
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

        // attach likeCount and userLiked to each comment
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

// Edit Comment (PUT)
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

        // FIX: Check admin status from database
        const isAdmin = await isUserAdmin(req.user.id);
        if (comment.userId !== req.user.id && !isAdmin) {
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

        // FIX: Check admin status from database
        const isAdmin = await isUserAdmin(req.user.id);
        if (comment.userId !== req.user.id && !isAdmin) {
            return res.status(403).json({ error: "Not authorized" });
        }

        // also delete replies and their likes when parent comment is deleted
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

// Comment Like endpoint
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

    res.json({
        id: req.user.id,
        displayName: req.user.displayName,
        email: req.user.email,
        photo: req.user.photo,
        isAdmin: req.user.isAdmin
    });
});

/* =======================
   ADMIN MANAGEMENT ENDPOINTS (Protected)
======================= */

// FIX: Promote user to admin (only current admins can do this)
app.post("/api/admin/promote", isLoggedIn, async (req, res) => {
    try {
        // Check if requester is admin
        const requesterIsAdmin = await isUserAdmin(req.user.id);
        if (!requesterIsAdmin) {
            return res.status(403).json({ error: "Only admins can promote users" });
        }

        const { userId, email, displayName } = req.body;

        if (!userId || !email) {
            return res.status(400).json({ error: "Missing userId or email" });
        }

        const result = await makeUserAdmin(userId, email, displayName);
        res.json(result);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Promotion failed" });
    }
});

// FIX: Remove user from admin (only current admins can do this)
app.post("/api/admin/demote", isLoggedIn, async (req, res) => {
    try {
        // Check if requester is admin
        const requesterIsAdmin = await isUserAdmin(req.user.id);
        if (!requesterIsAdmin) {
            return res.status(403).json({ error: "Only admins can demote users" });
        }

        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: "Missing userId" });
        }

        const result = await removeUserAdmin(userId);
        res.json(result);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Demotion failed" });
    }
});

// FIX: Get all admins (only admins can view)
app.get("/api/admin/list", isLoggedIn, async (req, res) => {
    try {
        const requesterIsAdmin = await isUserAdmin(req.user.id);
        if (!requesterIsAdmin) {
            return res.status(403).json({ error: "Only admins can view admin list" });
        }

        const admins = await Admin.find().select("userId email displayName createdAt");
        res.json(admins);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to fetch admin list" });
    }
});

// FIX: Fix comments with incorrect admin status
app.post("/api/admin/fix-comments", isLoggedIn, async (req, res) => {
    try {
        const requesterIsAdmin = await isUserAdmin(req.user.id);
        if (!requesterIsAdmin) {
            return res.status(403).json({ error: "Only admins can fix comments" });
        }

        // Get all comments
        const comments = await Comment.find();
        let fixed = 0;

        // Check each comment and fix admin status if needed
        for (let comment of comments) {
            const isAdmin = await isUserAdmin(comment.userId);
            if (comment.userIsAdmin !== isAdmin) {
                comment.userIsAdmin = isAdmin;
                await comment.save();
                fixed++;
            }
        }

        res.json({ success: true, message: `Fixed ${fixed} comments` });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to fix comments" });
    }
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