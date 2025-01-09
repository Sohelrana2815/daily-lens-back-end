const express = require("express");
const cron = require("node-cron");
const app = express();
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const strip = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;

// Middleware

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://daily-lens-90dd8.web.app",
      "https://daily-lens-90dd8.firebaseapp.com",
    ],
  })
);

app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5q2fm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const articlesCollection = client
      .db("DAILY_LENS_DB")
      .collection("articles");

    const publishersCollection = client
      .db("DAILY_LENS_DB")
      .collection("publishers");

    const usersCollection = client.db("DAILY_LENS_DB").collection("users");

    // jwt related api

    app.post("/jwt", async (req, res) => {
      const user = req.body;

      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });

      res.send({ token });
    });

    // Middleware (Verify Token)

    const verifyToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        console.log("token", req.headers);
        return res
          .status(401)
          .send({ message: "Token missing or unauthorized" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Invalid or expired token" });
        }
        req.decoded = decoded;
        next();
      });
    };
    // Middleware (Verify Admin)

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.isAdmin === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "Access Denied. Admins only." });
      }
      next();
    };

    // Middleware (Verify Premium users)

    const verifyPremium = async (req, res, next) => {
      try {
        const email = req.decoded.email;
        const query = { email: email };
        const user = await usersCollection.findOne(query);

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        // Check if the user's subscription is active
        if (
          !user.subscriptionPeriod ||
          new Date(user.subscriptionPeriod) < new Date()
        ) {
          return res.status(403).send({
            message: "Access denied: Subscription expired or not active",
          });
        }

        // User is verified and has an active subscription
        next();
      } catch (error) {
        console.error("Error in verifyPremium middleware:", error.message);
        res.status(500).send({ message: "Internal server error" });
      }
    };

    // check admin

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(401).send({ message: "Forbidden Access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let isAdmin = false;
      if (user) {
        isAdmin = user?.isAdmin === "admin";
      }
      res.send({ isAdmin });
    });

    // check for subscription status

    app.get("/users/subscription/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      if (!user || !user.subscriptionPeriod) {
        return res.send({ isPremium: false });
      }

      const currentDate = new Date();
      const subscriptionEndDate = new Date(user.subscriptionPeriod);
      if (subscriptionEndDate > currentDate) {
        return res.send({ isPremium: true });
      }
      res.send({ isPremium: false });
    });
    cron.schedule("* * * * *", async () => {
      console.log("Running subscription expiration check");

      try {
        const currentTime = new Date();
        // Filter expired subscription

        const filter = { subscriptionPeriod: { $lte: currentTime } };

        // Reset fields for expired users

        const updatedDoc = {
          $set: {
            subscriptionPeriod: null,
            amount: 0,
          },
        };
        const result = await usersCollection.updateMany(filter, updatedDoc);
        console.log(`Updated ${result.modifiedCount} users to normal status.`);
      } catch (error) {
        console.error("Error updating expired subscription:", error);
      }
    });

    // Users data
    app.get("/users", verifyToken, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // Showing users data in home page
    app.get("/users-home", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // Get Specific user data
    app.get("/users/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await usersCollection.findOne(filter);
      res.send(result);
    });
    // Post user data
    app.post("/users", async (req, res) => {
      const userData = req.body;

      const query = { email: userData.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({
          message: "This user is already exist!",
          insertedId: null,
        });
      }

      const result = await usersCollection.insertOne(userData);
      res.send(result);
    });

    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          isAdmin: "admin",
        },
      };
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // Publisher

    app.get("/publishers", async (req, res) => {
      const result = await publishersCollection.find().toArray();
      res.send(result);
    });
    // Post publisher data
    app.post("/publishers", verifyToken, verifyAdmin, async (req, res) => {
      const publisher = req.body;
      const result = await publishersCollection.insertOne(publisher);
      res.send(result);
    });

    // Get all posted articles data (Admin)
    app.get("/articles", async (req, res) => {
      const page = parseInt(req.query.page) || 1; // Default to page 1
      const limit = parseInt(req.query.limit) || 3; // Default to 3 articles
      const skip = (page - 1) * limit;

      const totalArticles = await articlesCollection.estimatedDocumentCount(); // Total number of articles

      const articles = await articlesCollection
        .find()
        .skip(skip)
        .limit(limit)
        .toArray();

      res.send({
        articles,
        currentPage: page,
        totalPages: Math.ceil(totalArticles / limit),
      });
    });

    // Get all posted articles for showing in analytics page

    app.get(
      "/analyticsArticles",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const result = await articlesCollection.find().toArray();
        res.send(result);
      }
    );

    // Get user posted articles
    app.get("/myArticles", verifyToken, async (req, res) => {
      // const token = req.decoded;
      // // console.log("token in the my article", token);
      const authorEmail = req.query.authorEmail;
      const filter = { authorEmail };
      console.log(filter);
      const result = await articlesCollection.find(filter).toArray();
      res.send(result);
    });

    //  Get specific article by _id

    app.get("/myArticles/:id", verifyToken, async (req, res) => {
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };

      const result = await articlesCollection.findOne(filter);

      res.send(result);
    });

    app.patch("/myArticles/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const myArticle = req.body;
      console.log(myArticle);
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          articleTitle: myArticle.articleTitle,
          articleDescription: myArticle.articleDescription,
          articleImage: myArticle.articleImage,
          publisherName: myArticle.publisherName,
          articleTags: myArticle.articleTags,
        },
      };
      const result = await articlesCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // Delete article

    app.delete("/myArticles/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await articlesCollection.deleteOne(filter);
      res.send(result);
    });

    // Only get articles approved by admin
    app.get("/approvedArticles", async (req, res) => {
      const filter = { status: "approved" };
      const result = await articlesCollection.find(filter).toArray();
      res.send(result);
    });

    // GET approve articles and premium articles
    app.get(
      "/premiumArticles",
      verifyToken,
      verifyPremium,
      async (req, res) => {
        const filter = { isPremium: true, status: "approved" };
        const result = await articlesCollection.find(filter).toArray();
        res.send(result);
      }
    );

    // Get specific approved article
    app.get("/approvedArticles/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id), status: "approved" };
      const result = await articlesCollection.findOne(filter);
      res.send(result);
    });
    // Increment view count for approved articles

    app.patch("/approvedArticles/:id/view", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id), status: "approved" };
      const update = { $inc: { views: 1 } }; // Increment view count by 1
      const result = await articlesCollection.updateOne(filter, update);
      if (result.modifiedCount === 0) {
        return res
          .status(404)
          .json({ message: "Article not found or not approved" });
      }

      res.send({ message: "View count updated successfully" });
    });

    // Get 6 trending articles by views in descending order
    app.get("/trendingArticles", async (req, res) => {
      const result = await articlesCollection
        .find({ status: "approved" })
        .sort({ views: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // Post articles
    app.post("/articles", verifyToken, async (req, res) => {
      const articleData = req.body;
      console.log(articleData);
      const result = await articlesCollection.insertOne(articleData);
      res.send(result);
    });

    // Get specific articles
    app.get("/articles/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await articlesCollection.findOne(filter);
      res.send(result);
    });

    // Approved specific article by admin
    app.patch(
      "/approveArticles/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;

        const filter = { _id: new ObjectId(id) };

        const updatedDoc = {
          $set: {
            status: "approved",
          },
        };
        const result = await articlesCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );
    // Decline specific article by admin
    app.patch(
      "/declineArticles/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const declineArticle = req.body;
        console.log(id, declineArticle);

        const filter = { _id: new ObjectId(id) };

        const updatedDoc = {
          $set: {
            status: declineArticle.status,
            declineReason: declineArticle.declineReason,
          },
        };

        const result = await articlesCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );
    // Make an article premium by admin
    app.patch(
      "/makePremium/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;

        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            isPremium: true,
          },
        };
        const result = await articlesCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );
    // Delete an specific article by admin
    app.delete("/articles/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };

      const result = await articlesCollection.deleteOne(filter);
      res.send(result);
    });

    // Payment intent

    app.post("/create-payment-intent", async (req, res) => {
      const { packagePrice } = req.body;
      // console.log(packagePrice);
      const price = parseInt(packagePrice.price * 100);
      // console.log(price);
      const paymentIntent = await strip.paymentIntents.create({
        amount: price,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // patch subscription expire date after payment

    app.patch("/userSubscriptionInfo/:email", async (req, res) => {
      const { subscriptionInfo } = req.body;
      console.log(subscriptionInfo);
      const email = req.params.email;

      // Get the current time

      const currentTime = new Date();
      let subscriptionExpires;

      // Calculate expiration time based on the period

      switch (subscriptionInfo.period) {
        case "1minute":
          subscriptionExpires = new Date(currentTime.getTime() + 1 * 60 * 1000); // Add 1 minute
          break;

        case "5days":
          subscriptionExpires = new Date(
            currentTime.getTime() + 5 * 24 * 3600 * 1000
          ); // Add 5 days
          break;
        case "10days":
          subscriptionExpires = new Date(
            currentTime.getTime() + 10 * 24 * 3600 * 1000
          );
          break;
        default:
          return res.status(400).send({ error: "Invalid subscription period" });
      }

      const filter = { email };

      const updatedDoc = {
        $set: {
          amount: subscriptionInfo.price,
          subscriptionPeriod: subscriptionExpires,
        },
      };
      try {
        const result = await usersCollection.updateOne(filter, updatedDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to update user subscription" });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Daily Lens Is Running....");
});

app.listen(port, () => {
  console.log(`Daily Lens is Running on port${port}`);
});
