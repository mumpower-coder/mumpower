const mongoose = require("mongoose");

const articleSchema = new mongoose.Schema({
  titre: { type: String, required: true },
  description: { type: String, required: true },
  prix: { type: Number, required: true },
  categorie: { type: String, default: "Autre" },
  vendeur: { type: String, required: true },
  vendeurId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  photo: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Article", articleSchema);