const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const strip = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;

// Middleware

app.use(cors());

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

    // Post user info

    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const userData = req.body;
      console.log(userData);
      const result = await usersCollection.insertOne(userData);
      res.send(result);
    });

    app.get("/users/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await usersCollection.findOne(filter);
      res.send(result);
    });

    // Get publishers data
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

    // Only get articles approved by admin
    app.get("/approvedArticles", async (req, res) => {
      const filter = { status: "approved" };
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

    // post subscription expire date after payment

    app.patch("/userSubscriptionInfo/:email", async (req, res) => {
      const { subscriptionInfo } = req.body;
      console.log(subscriptionInfo);
      const email = req.params.email;

      const filter = { email };
      const updatedDoc = {
        $set: {
          amount: subscriptionInfo.price,
          premiumExpires: subscriptionInfo.period,
        },
      };

      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
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
