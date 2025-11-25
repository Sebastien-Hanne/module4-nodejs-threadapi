import { Sequelize, DataTypes } from "sequelize";

/**
 *
 * @returns {Promise<Sequelize>}
 */
export async function loadSequelize() {
  try {
    // Configuration des identifiants de connexion.
    const login = {
      database: "app-database", // Nom de la base de données MySQL à utiliser.
      username: "root", // Nom d'utilisateur pour se connecter au serveur MySQL.
      password: "root", // Mot de passe pour la connexion.
    };

    // ----  0. Connexion au serveur mysql ----
    // Initialisation de l'instance Sequelize et connexion à la BDD.
    const sequelize = new Sequelize(
      login.database,
      login.username,
      login.password,
      {
        host: "127.0.0.1", // Adresse du serveur MySQL (ici, l'hôte local).
        dialect: "mysql", // Type de base de données (dialecte) utilisé.
      }
    );

    // ----  1. Création de tables via les models ----
    // Définition des modèles (qui représentent les tables dans la base de données)

    // Correction : Utilisation de l'instance 'sequelize'
    const User = sequelize.define("User", {
      username: DataTypes.STRING,
      email: DataTypes.STRING,
      password: DataTypes.STRING,
    });

    // Correction : Utilisation de l'instance 'sequelize'
    const Post = sequelize.define("Post", {
      title: DataTypes.TEXT,
      content: DataTypes.TEXT,
      //createdAt: DataTypes.DATE
    });

    // Définition des relations
    User.hasMany(Post);
    Post.belongsTo(User);

    // Correction : Utilisation de l'instance 'sequelize'
    const Comment = sequelize.define("Comment", {
      content: DataTypes.TEXT,
      //createdAt: DataTypes.DATE
    });

    User.hasMany(Comment);
    Post.hasMany(Comment);

    Comment.belongsTo(User);
    Comment.belongsTo(Post);

    // Correction : Utilisation de l'instance 'sequelize' pour la synchronisation
    await sequelize.sync({ force: true });
    console.log("Connexion à la BDD effectuée");

    // Correction : Retourne l'instance 'sequelize' connectée
    return sequelize;
  } catch (error) {
    console.log(error);
    throw new Error("Impossible de se connecter à la base de données");
  }
}
