const express = require("express");
const session = require("express-session");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const User = require("./models/User");
const Post = require("./models/Post");
const Article = require("./models/Article");
const Message = require("./models/Message");
const Story = require("./models/Story");
const Notification = require("./models/Notification");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "public/uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

mmongoose.connect("mongodb+srv://florianvoisin_db_user:YCuavJqKcaIor6oX@mumpower.0yc2gfo.mongodb.net/mumpower?retryWrites=true&w=majority")
  .then(() => console.log("MongoDB connecté"))
  .catch(err => console.log(err));

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: "mumpowerSecret",
  resave: false,
  saveUninitialized: false
}));

function requireAuth(req, res, next) {
  if (req.session.userId) return next();
  res.redirect("/");
}

// Socket.io - gestion des connexions
const usersConnectes = {};

io.on("connection", (socket) => {
  socket.on("rejoindre", (userId) => {
    usersConnectes[userId] = socket.id;
  });

  socket.on("disconnect", () => {
    for (const [userId, socketId] of Object.entries(usersConnectes)) {
      if (socketId === socket.id) {
        delete usersConnectes[userId];
        break;
      }
    }
  });
});

// LOGIN
app.get("/", (req, res) => res.render("login", { error: undefined }));

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.render("login", { error: "Email ou mot de passe incorrect" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.render("login", { error: "Email ou mot de passe incorrect" });
    req.session.userId = user._id;
    req.session.userName = user.nom;
    res.redirect("/home");
  } catch (err) {
    res.render("login", { error: "Une erreur est survenue" });
  }
});

// REGISTER
app.get("/register", (req, res) => res.render("register", { error: undefined }));

app.post("/register", async (req, res) => {
  const { nom, email, password } = req.body;
  try {
    const exists = await User.findOne({ email });
    if (exists) return res.render("register", { error: "Cet email est déjà utilisé" });
    const hash = await bcrypt.hash(password, 10);
    const user = new User({ nom, email, password: hash });
    await user.save();
    req.session.userId = user._id;
    req.session.userName = user.nom;
    res.redirect("/home");
  } catch (err) {
    res.render("register", { error: "Une erreur est survenue" });
  }
});

// HOME
app.get("/home", requireAuth, async (req, res) => {
  const posts = await Post.find().sort({ createdAt: -1 });
  const stories = await Story.find().sort({ createdAt: -1 });
  res.render("home", {
    userName: req.session.userName,
    userId: req.session.userId.toString(),
    posts,
    stories
  });
});

// PUBLIER POST
app.post("/post", requireAuth, async (req, res) => {
  const { content } = req.body;
  if (content.trim()) {
    await Post.create({
      auteur: req.session.userName,
      userId: req.session.userId,
      content: content.trim()
    });
  }
  res.redirect("/home");
});

// SUPPRIMER POST
app.post("/post/delete/:id", requireAuth, async (req, res) => {
  await Post.findOneAndDelete({ _id: req.params.id, userId: req.session.userId });
  res.redirect("/home");
});

// LIKER
app.post("/post/like/:id", requireAuth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.redirect("/home");
  if (!post.likes) post.likes = [];

  const deja = post.likes.map(l => l.toString()).includes(req.session.userId.toString());
  if (deja) {
    post.likes = post.likes.filter(l => l.toString() !== req.session.userId.toString());
  } else {
    post.likes.push(req.session.userId);

    // Notification si ce n'est pas son propre post
    if (post.userId.toString() !== req.session.userId.toString()) {
      const notif = await Notification.create({
        destinataireId: post.userId,
        type: "like",
        declencheur: req.session.userName,
        message: `${req.session.userName} a aimé ta publication`,
        lien: "/home"
      });

      const socketId = usersConnectes[post.userId.toString()];
      if (socketId) {
        io.to(socketId).emit("nouvelle-notif", {
          message: notif.message,
          type: notif.type
        });
      }
    }
  }
  await post.save();
  res.redirect("/home");
});

// COMMENTER
app.post("/post/commenter/:id", requireAuth, async (req, res) => {
  const { contenu } = req.body;
  if (!contenu.trim()) return res.redirect("/home");

  const post = await Post.findByIdAndUpdate(req.params.id, {
    $push: {
      commentaires: {
        auteur: req.session.userName,
        auteurId: req.session.userId,
        contenu: contenu.trim()
      }
    }
  }, { new: true });

  // Notification si ce n'est pas son propre post
  if (post.userId.toString() !== req.session.userId.toString()) {
    const notif = await Notification.create({
      destinataireId: post.userId,
      type: "commentaire",
      declencheur: req.session.userName,
      message: `${req.session.userName} a commenté ta publication`,
      lien: "/home"
    });

    const socketId = usersConnectes[post.userId.toString()];
    if (socketId) {
      io.to(socketId).emit("nouvelle-notif", {
        message: notif.message,
        type: notif.type
      });
    }
  }

  res.redirect("/home");
});

// ENVOYER MESSAGE avec notification
app.post("/messages/envoyer", requireAuth, async (req, res) => {
  const { aId, contenu } = req.body;
  const destinataire = await User.findById(aId);
  if (!destinataire || !contenu.trim()) return res.redirect("/messages");

  await Message.create({
    de: req.session.userName,
    deId: req.session.userId,
    a: destinataire.nom,
    aId: destinataire._id,
    contenu: contenu.trim()
  });

  const notif = await Notification.create({
    destinataireId: aId,
    type: "message",
    declencheur: req.session.userName,
    message: `${req.session.userName} t'a envoyé un message`,
    lien: "/messages/" + req.session.userId
  });

  const socketId = usersConnectes[aId.toString()];
  if (socketId) {
    io.to(socketId).emit("nouvelle-notif", {
      message: notif.message,
      type: notif.type
    });
  }

  res.redirect("/messages/" + aId);
});

// SUPPRIMER COMMENTAIRE
app.post("/post/comment/delete/:postId/:commentId", requireAuth, async (req, res) => {
  await Post.findByIdAndUpdate(req.params.postId, {
    $pull: { commentaires: { _id: req.params.commentId, auteurId: req.session.userId } }
  });
  res.redirect("/home");
});

// MARKETPLACE
app.get("/marketplace", requireAuth, async (req, res) => {
  const articles = await Article.find().sort({ createdAt: -1 });
  res.render("marketplace", {
    userName: req.session.userName,
    userId: req.session.userId.toString(),
    articles
  });
});

app.post("/marketplace/vendre", requireAuth, upload.single("photo"), async (req, res) => {
  const { titre, description, prix, categorie } = req.body;
  const photo = req.file ? "/uploads/" + req.file.filename : "";
  await Article.create({
    titre, description, prix, categorie, photo,
    vendeur: req.session.userName,
    vendeurId: req.session.userId
  });
  res.redirect("/marketplace");
});

app.post("/marketplace/delete/:id", requireAuth, async (req, res) => {
  await Article.findOneAndDelete({ _id: req.params.id, vendeurId: req.session.userId });
  res.redirect("/marketplace");
});

// MESSAGES
app.get("/messages", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const userName = req.session.userName;
  const messages = await Message.find({
    $or: [{ deId: userId }, { aId: userId }]
  }).sort({ createdAt: -1 });

  const convMap = {};
  messages.forEach(msg => {
    const autreNom = msg.de === userName ? msg.a : msg.de;
    const autreId = msg.de === userName ? msg.aId.toString() : msg.deId.toString();
    if (!convMap[autreId]) {
      convMap[autreId] = {
        nom: autreNom,
        id: autreId,
        dernierMsg: msg.contenu,
        date: msg.createdAt,
        nonLu: msg.a === userName && !msg.lu ? 1 : 0
      };
    } else if (msg.a === userName && !msg.lu) {
      convMap[autreId].nonLu++;
    }
  });

  const conversations = Object.values(convMap);
  const users = await User.find({ _id: { $ne: userId } });
  res.render("messages", {
    userName, userId: userId.toString(),
    conversations, users,
    convActive: null, messagesConv: []
  });
});

app.get("/messages/:avecId", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const userName = req.session.userName;
  const avecId = req.params.avecId;
  const avecUser = await User.findById(avecId);
  if (!avecUser) return res.redirect("/messages");

  await Message.updateMany({ deId: avecId, aId: userId, lu: false }, { lu: true });

  const messagesConv = await Message.find({
    $or: [
      { deId: userId, aId: avecId },
      { deId: avecId, aId: userId }
    ]
  }).sort({ createdAt: 1 });

  const messages = await Message.find({
    $or: [{ deId: userId }, { aId: userId }]
  }).sort({ createdAt: -1 });

  const convMap = {};
  messages.forEach(msg => {
    const autreNom = msg.de === userName ? msg.a : msg.de;
    const autreId = msg.de === userName ? msg.aId.toString() : msg.deId.toString();
    if (!convMap[autreId]) {
      convMap[autreId] = {
        nom: autreNom, id: autreId,
        dernierMsg: msg.contenu, date: msg.createdAt,
        nonLu: msg.a === userName && !msg.lu ? 1 : 0
      };
    }
  });

  const conversations = Object.values(convMap);
  const users = await User.find({ _id: { $ne: userId } });
  res.render("messages", {
    userName, userId: userId.toString(),
    conversations, users,
    convActive: { id: avecId, nom: avecUser.nom },
    messagesConv
  });
});

app.post("/messages/envoyer", requireAuth, async (req, res) => {
  const { aId, contenu } = req.body;
  const destinataire = await User.findById(aId);
  if (!destinataire || !contenu.trim()) return res.redirect("/messages");
  await Message.create({
    de: req.session.userName,
    deId: req.session.userId,
    a: destinataire.nom,
    aId: destinataire._id,
    contenu: contenu.trim()
  });
  res.redirect("/messages/" + aId);
});

// PROFIL
app.get("/profil", requireAuth, async (req, res) => {
  const user = await User.findById(req.session.userId);
  const posts = await Post.find({ userId: req.session.userId }).sort({ createdAt: -1 });
  const articles = await Article.find({ vendeurId: req.session.userId }).sort({ createdAt: -1 });
  res.render("profil", {
    userName: req.session.userName,
    userId: req.session.userId.toString(),
    user, posts, articles
  });
});

app.post("/profil/modifier", requireAuth, upload.single("avatar"), async (req, res) => {
  const { bio, ville, enfants } = req.body;
  const update = { bio, ville, enfants };
  if (req.file) update.avatar = "/uploads/" + req.file.filename;
  await User.findByIdAndUpdate(req.session.userId, update);
  res.redirect("/profil");
});

// PARAMÈTRES
app.get("/parametres", requireAuth, async (req, res) => {
  const user = await User.findById(req.session.userId);
  res.render("parametres", {
    userName: req.session.userName,
    user, success: undefined, error: undefined
  });
});

app.post("/parametres/email", requireAuth, async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findById(req.session.userId);
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.render("parametres", { userName: req.session.userName, user, error: "Mot de passe incorrect", success: undefined });
  const exists = await User.findOne({ email });
  if (exists) return res.render("parametres", { userName: req.session.userName, user, error: "Cet email est déjà utilisé", success: undefined });
  await User.findByIdAndUpdate(req.session.userId, { email });
  res.render("parametres", { userName: req.session.userName, user: { ...user._doc, email }, success: "Email mis à jour avec succès", error: undefined });
});

app.post("/parametres/password", requireAuth, async (req, res) => {
  const { ancien, nouveau, confirmer } = req.body;
  const user = await User.findById(req.session.userId);
  const match = await bcrypt.compare(ancien, user.password);
  if (!match) return res.render("parametres", { userName: req.session.userName, user, error: "Ancien mot de passe incorrect", success: undefined });
  if (nouveau !== confirmer) return res.render("parametres", { userName: req.session.userName, user, error: "Les mots de passe ne correspondent pas", success: undefined });
  if (nouveau.length < 6) return res.render("parametres", { userName: req.session.userName, user, error: "Le mot de passe doit faire au moins 6 caractères", success: undefined });
  const hash = await bcrypt.hash(nouveau, 10);
  await User.findByIdAndUpdate(req.session.userId, { password: hash });
  res.render("parametres", { userName: req.session.userName, user, success: "Mot de passe mis à jour avec succès", error: undefined });
});

app.post("/parametres/supprimer", requireAuth, async (req, res) => {
  const { password } = req.body;
  const user = await User.findById(req.session.userId);
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.render("parametres", { userName: req.session.userName, user, error: "Mot de passe incorrect", success: undefined });
  await User.findByIdAndDelete(req.session.userId);
  await Post.deleteMany({ userId: req.session.userId });
  await Article.deleteMany({ vendeurId: req.session.userId });
  req.session.destroy();
  res.redirect("/");
});

// STORIES
app.post("/story/publier", requireAuth, upload.single("photo"), async (req, res) => {
  if (!req.file) return res.redirect("/home");
  await Story.create({
    auteur: req.session.userName,
    auteurId: req.session.userId,
    photo: "/uploads/" + req.file.filename
  });
  res.redirect("/home");
});

app.get("/story/:id", requireAuth, async (req, res) => {
  const story = await Story.findById(req.params.id);
  if (!story) return res.redirect("/home");
  if (!story.vues.includes(req.session.userId)) {
    story.vues.push(req.session.userId);
    await story.save();
  }
  res.render("story", {
    userName: req.session.userName,
    userId: req.session.userId.toString(),
    story
  });
});

app.post("/story/delete/:id", requireAuth, async (req, res) => {
  await Story.findOneAndDelete({ _id: req.params.id, auteurId: req.session.userId });
  res.redirect("/home");
});

// LOGOUT
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});
// NOTIFICATIONS
app.get("/notifications", requireAuth, async (req, res) => {
  const notifs = await Notification.find({ destinataireId: req.session.userId })
    .sort({ createdAt: -1 })
    .limit(50);
  await Notification.updateMany({ destinataireId: req.session.userId, lu: false }, { lu: true });
  res.render("notifications", {
    userName: req.session.userName,
    userId: req.session.userId.toString(),
    notifs
  });
});

app.get("/notifications/count", requireAuth, async (req, res) => {
  const count = await Notification.countDocuments({ destinataireId: req.session.userId, lu: false });
  res.json({ count });
});
// RECHERCHE
app.get("/recherche", requireAuth, async (req, res) => {
  const q = req.query.q || "";
  let users = [];
  let posts = [];
  let articles = [];

  if (q.trim()) {
    users = await User.find({
      nom: { $regex: q, $options: "i" },
      _id: { $ne: req.session.userId }
    }).limit(10);

    posts = await Post.find({
      content: { $regex: q, $options: "i" }
    }).sort({ createdAt: -1 }).limit(10);

    articles = await Article.find({
      $or: [
        { titre: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } }
      ]
    }).sort({ createdAt: -1 }).limit(10);
  }

  res.render("recherche", {
    userName: req.session.userName,
    userId: req.session.userId.toString(),
    q,
    users,
    posts,
    articles
  });
});
// MODULE AIDE DISCRÈTE
app.get("/aide", requireAuth, (req, res) => {
  res.render("aide", {
    userName: req.session.userName,
    userId: req.session.userId.toString()
  });
});
// LANDING PAGE PUBLIQUE
app.get("/landing", (req, res) => {
  res.render("landing");
});
server.listen(3000, () => console.log("Serveur lancé sur http://localhost:3000"));