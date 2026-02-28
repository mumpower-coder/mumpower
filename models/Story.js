const mongoose = require("mongoose");

const storySchema = new mongoose.Schema({
  auteur: { type: String, required: true },
  auteurId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  photo: { type: String, required: true },
  vues: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400
  }
});

module.exports = mongoose.model("Story", storySchema);