
import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB Connection
const client = new MongoClient(process.env.MONGODB_URL);

await client.connect();
console.log("You successfully connected to MongoDB!");

const database = client.db("mentorlagbe");

const users = database.collection("user");
const tuitions = database.collection("tuitions");
const applications = database.collection("applications");


// Home API
app.get("/", (req, res) => {
  res.send("Mentorlagbe is running");
});


// Get All Users
app.get("/users", async (req, res) => {
  const result = await users.find().toArray();
  res.send(result);
});



// Tuition Related APIs
// Post Tuition
app.post("/tuitions", async (req, res) => {
  const tuition = req.body;

  const result = await tuitions.insertOne(tuition);

  res.send(result);
});


// Get All Tuitions
app.get("/tuitions", async (req, res) => {
  const result = await tuitions
    .find()
    .sort({ _id: -1 })
    .toArray();

  res.send(result);
});


// Get Single Tuition
app.get("/tuitions/:id", async (req, res) => {
  const id = req.params.id;

  const result = await tuitions.findOne({
    _id: new ObjectId(id),
  });

  res.send(result);
});


// Update Tuition
app.put("/tuitions/:id", async (req, res) => {
  const id = req.params.id;
  const updatedData = req.body;

  const result = await tuitions.updateOne(
    { _id: new ObjectId(id) },
    { $set: updatedData }
  );

  res.send(result);
});


// Update Tuition Status
app.patch("/tuitions/:id/status", async (req, res) => {
  const id = req.params.id;
  const { approvalStatus } = req.body;

  const result = await tuitions.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        approvalStatus: approvalStatus,
      },
    }
  );

  res.send(result);
});


// Delete Tuition
app.delete("/tuitions/:id", async (req, res) => {
  const id = req.params.id;

  const result = await tuitions.deleteOne({
    _id: new ObjectId(id),
  });

  res.send(result);
});



// Application Related APIs

// Post Application
app.post("/applications", async (req, res) => {
  const application = req.body;

  const result = await applications.insertOne(application);

  res.send(result);
});


// Get All Applications (Filter by User ID)
app.get("/applications", async (req, res) => {
  const userId = req.query.userId;

  const query = userId ? { userId: userId } : {};

  const result = await applications.find(query).toArray();

  res.send(result);
});


// Application Count
app.get("/applications/count", async (req, res) => {
  const userId = req.query.userId;

  const query = userId ? { userId: userId } : {};

  const count = await applications.countDocuments(query);

  res.send({ count });
});


// Get Applicants by Tutor Email
app.get("/applications/tutor/:email", async (req, res) => {
  const email = decodeURIComponent(req.params.email);

  const result = await applications.find({
    tutorEmail: email,
  }).toArray();

  res.send(result);
});


// Get Single Application
app.get("/applications/:id", async (req, res) => {
  const id = req.params.id;

  const result = await applications.findOne({
    _id: new ObjectId(id),
  });

  res.send(result);
});



// Delete Pending Application
app.delete("/applications/:id", async (req, res) => {
  const id = req.params.id;
  const userId = req.query.userId;

  const result = await applications.deleteOne({
    _id: new ObjectId(id),
    userId: userId,
    status: "Pending",
  });

  res.send(result);
});


//update application status
app.patch("/applications/:id/status", async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;

  const result = await applications.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        status: status,
      },
    }
  );

  res.send(result);
});



//find single user by id 
app.get("/users/:id", async (req, res) => {
  const id = req.params.id;

  const result = await users.findOne({
    _id: new ObjectId(id),
  });

  res.send(result);
});



//update user profie
app.patch("/users/:id", async (req, res) => {
  const id = req.params.id;

  const result = await users.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: req.body,
    }
  );

  res.send(result);
});

// Start Server
app.listen(port, () => {
  console.log(`Mentorlagbe is running on port ${port}`);
});