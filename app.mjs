// Importations des modules nécessaires pour le serveur
import { loadSequelize } from "./database.mjs"; // Module pour charger et configurer Sequelize et la base de données.
import express from "express"; // Framework pour créer l'API REST.
import jwt from "jsonwebtoken"; // Pour générer et vérifier les JSON Web Tokens (JWT).
import cors from "cors"; // Middleware pour gérer la politique Cross-Origin Resource Sharing (CORS).
import bcrypt from "bcrypt"; // Pour le hachage sécurisé des mots de passe.
import cookieParser from "cookie-parser"; // Middleware pour parser et gérer les cookies de la requête.

/**
 * Point d'entrée de l'application
 * Cette fonction asynchrone initialise le serveur et définit les routes de l'API.
 */
async function main() {
  // Définition de la clé secrète pour signer les JWT. 
  const JWT_SECRET = "Non_non_non_tu_ne_rentrera_pas_comme_ça"; 

  // --- Définition du Middleware d'Authentification ---

  // Middleware Express pour vérifier la présence et la validité d'un JWT dans les cookies.
  const isLoggedInJWT = (req, res, next) => {
    // 1. Tente de récupérer le token nommé 'token' depuis les cookies.
    const token = req.cookies.token;

    if (!token) {
      // Si aucun token n'est trouvé, l'accès est refusé (Statut 401: Non authentifié).
      return res
        .status(401)
        .json({ message: "Accès refusé. Veuillez vous connecter." });
    }
    try {
      // 2. Vérifie et décode le token en utilisant la clé secrète.
      const decoded = jwt.verify(token, JWT_SECRET);

      // 3. Attache l'ID de l'utilisateur (issu du token) à l'objet 'req'.
      // Cela permet aux routes protégées de savoir qui fait la requête (`req.user.id`).
      req.user = { id: decoded.userId };
      
      // 4. Passe le contrôle à la prochaine fonction middleware ou à la fonction de route finale.
      next();
    } catch (error) {
      // En cas d'échec de la vérification (token altéré, expiré ou signature invalide).
      res.status(403).json({ message: "Token invalide ou expiré." });
    }
  };
  
  // --- Initialisation du Serveur et de la Base de Données ---

  try {
    // Charge la configuration Sequelize et se connecte à la base de données.
    const sequelize = await loadSequelize();

    // Récupération des modèles ORM (Object-Relational Mapping) définis par Sequelize.
    const User = sequelize.models.User;
    const Post = sequelize.models.Post;
    const Comment = sequelize.models.Comment;

    const app = express();
    // Middleware pour parser les corps de requête au format JSON.
    app.use(express.json());
    // Middleware pour gérer les cookies.
    app.use(cookieParser());

    // Configuration CORS pour autoriser les requêtes depuis un client spécifique (front-end).
    app.use(
      cors({
        origin: "http://localhost:3000", // L'URL du client autorisé.
        credentials: true, // Crucial pour autoriser l'envoi et la réception de cookies d'authentification.
      })
    );

    // --- Définition des Routes Publiques (Lecture / Authentification) ---

    // GET /users : Récupère la liste de tous les utilisateurs (pour le debug ou une page publique).
    app.get("/users", async (request, response) => {
      const users = await User.findAll();
      response.json(users);
    });

    // POST /register : Enregistre un nouvel utilisateur.
    app.post("/register", async (req, res) => {
      const { email, password, verifiedPassword } = req.body;

      // Validation des champs requis.
      if (!email || !password || !verifiedPassword) {
        return res.status(400).json({
          message:
            "Email, mot de passe et la vérification du mot de passe sont requis",
        });
      }

      // Validation de la correspondance des mots de passe.
      if (password !== verifiedPassword) {
        return res
          .status(400)
          .json({ message: "Mot de passe ne correspond pas" });
      }

      try {
        // Hachage du mot de passe avec bcrypt avant de le stocker.
        const saltRounds = 10; // Niveau de complexité du hachage.
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Création de l'utilisateur dans la base de données.
        const newUser = await User.create({ email, password: hashedPassword });
        
        // Réponse de succès (Statut 201: Créé).
        res.status(201).json({
          message: "Utilisateur enregistrer avec succés",
          userId: newUser.id,
        });
      } catch (error) {
        // Gestion des erreurs de base de données (ex: email déjà existant si unique).
        res.status(500).json({
          message: "Erreur lors de la création de l utilisateur",
          error: error.message,
        });
      }
    });

    // POST /login : Connecte un utilisateur existant.
    app.post("/login", async (req, res) => {
      const { email, password } = req.body;

      if (!email || !password) {
        return res
          .status(400)
          .json({ message: "Email et mot de passe sont requis" });
      }

      try {
        // Recherche l'utilisateur par email.
        const user = await User.findOne({ where: { email } });

        // Vérification de l'existence de l'utilisateur.
        if (!user) {
          return res
            .status(401)
            .json({ message: "Email ou mot de passe invalide" });
        }

        // Comparaison du mot de passe fourni avec le hash stocké.
        const isMatch = await bcrypt.compare(password, user.password);

        // Vérification de la correspondance des mots de passe.
        if (!isMatch) {
          return res
            .status(401)
            .json({ message: "Email ou mot de passe invalide" });
        }

        // Création du JWT contenant l'ID de l'utilisateur.
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
          expiresIn: "12h", // Le token expire après 12 heures.
        });

        // Envoi du token dans un cookie HttpOnly.
        res.cookie("token", token, {
          httpOnly: true, // Le cookie n'est pas accessible par JavaScript côté client (sécurité XSS).
          secure: process.env.NODE_ENV === "production", // N'envoyer qu'en HTTPS en production.
        });

        res.json({ message: "connexion avec succés" });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Erreur de connexion", error: error.message });
      }
    });

    // POST /logout : Déconnecte l'utilisateur.
    app.post("/logout", (req, res) => {
      // Supprime le cookie 'token' du navigateur, mettant fin à la session.
      res.clearCookie("token");
      res.json({ message: "Deconnexion réussi" });
    });

    // --- Définition des Routes Protégées (Nécessitent isLoggedInJWT) ---

    // POST /post : Crée un nouveau post.
    app.post("/post", isLoggedInJWT, async (req, res) => {
      const newPostData = req.body; 
      try {
        // Crée le post en utilisant l'ID de l'utilisateur récupéré par le middleware `isLoggedInJWT`.
        const newPost = await Post.create({
          title: newPostData.title,
          content: newPostData.content,
          UserId: req.user.id, 
        });
        res.json(newPost); 
      } catch (error) {
        res.status(500).json({ error: "Erreur lors de la création du post" });
      }
    });

    // POST /posts/:postId/comments : Ajoute un commentaire à un post spécifique.
    app.post("/posts/:postId/comments", isLoggedInJWT, async (req, res) => {
      const { postId } = req.params;
      const { content } = req.body;

      try {
        // Vérification de l'existence du Post cible.
        const post = await Post.findByPk(postId);
        if (!post) {
          return res.status(404).json({ message: "Post non trouvé" });
        }

        // Création du commentaire avec l'ID du Post et l'ID de l'utilisateur connecté.
        const newComment = await sequelize.models.Comment.create({
          content,
          PostId: postId,
          UserId: req.user.id,
        });

        res.status(201).json(newComment);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Erreur lors de la création du commentaire" });
      }
    });

    // GET /posts : Récupère tous les posts, incluant leurs auteurs et leurs commentaires.
    app.get("/posts", async (req, res) => {
      try {
        // Utilisation de `include` pour récupérer les données liées (relations) en une seule requête DB.
        const posts = await Post.findAll({
          include: [
            {
              model: User, // Inclusion de l'auteur du Post.
              attributes: ["id", "email"], // Ne sélectionne que l'ID et l'email de l'auteur (sécurité : pas de mot de passe).
            },
            {
              model: Comment, // Inclusion des commentaires.
              include: [
                {
                  model: User, // Inclusion de l'auteur de chaque commentaire.
                  attributes: ["id", "email"],
                },
              ],
            },
          ],
        });
        res.json(posts);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Erreur lors de la récupération des posts" });
      }
    });

    // GET /users/:userId/posts : Récupère tous les posts créés par un utilisateur donné.
    app.get("/users/:userId/posts", async (req, res) => {
      const { userId } = req.params;
      try {
        // Recherche l'utilisateur et inclut tous ses posts et les commentaires associés.
        const user = await User.findByPk(userId, {
          include: [
            {
              model: Post,
              include: [
                {
                  model: Comment,
                  include: [
                    {
                      model: User,
                      attributes: ["id", "email"],
                    },
                  ],
                },
              ],
            },
          ],
        });

        if (!user) {
          return res.status(404).json({ message: "Utilisateur non trouvé" });
        }

        // Renvoie uniquement la liste des posts de l'utilisateur.
        res.json(user.Posts);
      } catch (error) {
        res
          .status(500)
          .json({
            message:
              "Erreur lors de la récupération des posts de l'utilisateur",
          });
      }
    });

    // DELETE /posts/:postId : Supprime un post.
    app.delete("/posts/:postId", isLoggedInJWT, async (req, res) => {
      const { postId } = req.body;

      try {
        const post = await Post.findByPk(postId);

        if (!post) {
          return res.status(404).json({ message: "Post non trouvé" });
        }

        // **Vérification d'Autorisation (Authorization Check)** :
        // S'assure que l'utilisateur connecté est bien l'auteur du post.
        if (post.UserId !== req.user.id) {
          return res.status(403).json({ message: "Action interdite" });
        }

        await post.destroy();
        res.json({ message: "Post supprimé avec succès" });
      } catch (error) {
        res
          .status(500).json({ message: "Erreur lors de la suppression du post" });
      }
    });

    // DELETE /comments/:commentId : Supprime un commentaire.
    app.delete("/comments/:commentId", isLoggedInJWT, async (req, res) => {
      const { commentId } = req.params;

      try {
        const comment = await Comment.findByPk(commentId);

        if (!comment) {
          return res.status(404).json({ message: "Commentaire non trouvé" });
        }

        // **Vérification d'Autorisation** :
        // S'assure que l'utilisateur connecté est bien l'auteur du commentaire.
        if (comment.UserId !== req.user.id) {
          return res.status(403).json({ message: "Action interdite" });
        }

        await comment.destroy();
        res.json({ message: "Commentaire supprimé avec succès" });
      } catch (error) {
        res
          .status(500).json({ message: "Erreur lors de la suppression du commentaire" });
      }
    });

    // Démarrage du serveur Express sur le port 3000.
    app.listen(3000, () => {
      console.log("Serveur démarré sur http://localhost:3000");
    });
  } catch (error) {
    // Gestion des erreurs d'initialisation (si la base de données ne se connecte pas).
    console.error("Error de chargement de Sequelize:", error);
  }
}

// Appel de la fonction principale pour lancer l'application.
main();