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

// const uri = "mongodb://localhost:27017";

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

    // Cron job to handle subscription expiration

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
    app.get("/users", async (req, res) => {
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
    app.post("/publishers", async (req, res) => {
      const publisher = req.body;
      const result = await publishersCollection.insertOne(publisher);
      res.send(result);
    });

    // Get all posted articles data (Admin)
    app.get("/articles", async (req, res) => {
      const result = await articlesCollection.find().toArray();
      res.send(result);
    });

    // Get user posted articles
    app.get("/myArticles", async (req, res) => {
      const authorEmail = req.query.authorEmail;
      const filter = { authorEmail };
      console.log(filter);
      const result = await articlesCollection.find(filter).toArray();
      res.send(result);
    });

    //  Get specific article by _id

    app.get("/myArticles/:id", async (req, res) => {
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };

      const result = await articlesCollection.findOne(filter);

      res.send(result);
    });

    app.patch("/myArticles/:id", async (req, res) => {
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

    app.delete("/myArticles/:id", async (req, res) => {
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
    app.get("/premiumArticles", async (req, res) => {
      const filter = { isPremium: true, status: "approved" };
      const result = await articlesCollection.find(filter).toArray();
      res.send(result);
    });

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
    app.post("/articles", async (req, res) => {
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
    app.patch("/approveArticles/:id", async (req, res) => {
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };

      const updatedDoc = {
        $set: {
          status: "approved",
        },
      };
      const result = await articlesCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });
    // Decline specific article by admin
    app.patch("/declineArticles/:id", async (req, res) => {
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
    });
    // Make an article premium by admin
    app.patch("/makePremium/:id", async (req, res) => {
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          isPremium: true,
        },
      };
      const result = await articlesCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });
    // Delete an specific article by admin
    app.delete("/articles/:id", async (req, res) => {
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
