const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
  auteur: { type: String, required: true },
  auteurId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  contenu: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const postSchema = new mongoose.Schema({
  auteur: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  content: { type: String, required: true },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  commentaires: [commentSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Post", postSchema);