const mongoose = require("mongoose");

const notifSchema = new mongoose.Schema({
  destinataireId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["like", "commentaire", "message"], required: true },
  declencheur: { type: String, required: true },
  message: { type: String, required: true },
  lu: { type: Boolean, default: false },
  lien: { type: String, default: "/home" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Notification", notifSchema);