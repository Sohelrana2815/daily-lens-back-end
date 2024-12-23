const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();

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

    app.get("/publishers", async (req, res) => {
      const result = await publishersCollection.find().toArray();
      res.send(result);
    });

    app.post("/publishers", async (req, res) => {
      const publisher = req.body;
      const result = await publishersCollection.insertOne(publisher);
      res.send(result);
    });

    app.get("/articles", async (req, res) => {
      const result = await articlesCollection.find().toArray();
      res.send(result);
    });

    app.get("/approvedArticles", async (req, res) => {
      const status = req.query;
      const filter = status;
      const result = await articlesCollection.find(filter).toArray();
      res.send(result);
    });

    app.post("/articles", async (req, res) => {
      const articleData = req.body;
      console.log(articleData);
      const result = await articlesCollection.insertOne(articleData);
      res.send(result);
    });

    app.get("/articles/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await articlesCollection.findOne(filter);
      res.send(result);
    });

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

    app.delete("/articles/:id", async (req, res) => {
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };

      const result = await articlesCollection.deleteOne(filter);
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
