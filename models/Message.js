const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  de: { type: String, required: true },
  deId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  a: { type: String, required: true },
  aId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  contenu: { type: String, required: true },
  lu: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Message", messageSchema);