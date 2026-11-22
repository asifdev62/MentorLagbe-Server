
import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';
import Stripe from "stripe";


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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
const payments = database.collection("payments");

// Escape user input before building a case-insensitive RegExp
const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildEmailRegex = (email) =>
  new RegExp(`^${escapeRegex(email)}$`, "i");


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


// Get All Tuitions (optionally filter by user, tutor email or approval status)
app.get("/tuitions", async (req, res) => {
  const { userId, tutorEmail, approvalStatus } = req.query;

  const query = {};

  if (userId) {
    query.userId = userId;
  }

  if (tutorEmail) {
    query.tutorEmail = tutorEmail;
  }

  if (approvalStatus) {
    query.approvalStatus = approvalStatus;
  }

  const result = await tuitions
    .find(query)
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
  const application = { ...req.body };

  // Make sure the application is linked to the tuition's tutor even if
  // an older client did not send tutorEmail / tutorId.
  try {
    if (application.tuitionId) {
      const tuition = await tuitions.findOne({
        _id: new ObjectId(application.tuitionId),
      });

      if (tuition) {
        application.tutorEmail =
          application.tutorEmail || tuition.tutorEmail;
        application.tutorId = application.tutorId || tuition.userId;
      }
    }
  } catch {
    // Ignore invalid tuition ids and keep the application as-is.
  }

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
  try {
    const applicantId = req.query.applicantId;

    const count = await applications.countDocuments({
      userId: applicantId,
    });

    res.send({ count });
  } catch (error) {
    res.status(500).send({
      message: "Failed to get application count",
    });
  }
});


// Get Applicants by Tutor Email
// An application belongs to a tutor if:
//  - its tutorEmail matches the tutor, or
//  - its tuitionId belongs to a tuition posted by that tutor.
app.get("/applications/tutor/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email || "").trim();

    if (!email) {
      return res.send([]);
    }

    const emailRegex = buildEmailRegex(email);

    const tutor = await users.findOne({ email: emailRegex });

    const tuitionFilters = [{ tutorEmail: emailRegex }];

    if (tutor) {
      tuitionFilters.push({ userId: tutor._id.toString() });
      tuitionFilters.push({ userId: tutor._id });
    }

    const tutorTuitions = await tuitions
      .find({ $or: tuitionFilters }, { projection: { _id: 1 } })
      .toArray();

    const tuitionIds = tutorTuitions.map((item) => item._id.toString());

    const result = await applications
      .find({
        $or: [
          { tutorEmail: emailRegex },
          { tuitionId: { $in: tuitionIds } },
        ],
      })
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch applicants",
    });
  }
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


// Update application status (Pending / Accepted / Rejected)
app.patch("/applications/:id/status", async (req, res) => {
  const id = req.params.id;
  const { status } = req.body || {};

  const allowedStatuses = ["Pending", "Accepted", "Rejected"];

  const normalizedStatus =
    typeof status === "string" && status.trim()
      ? status.trim().charAt(0).toUpperCase() +
        status.trim().slice(1).toLowerCase()
      : "";

  if (!allowedStatuses.includes(normalizedStatus)) {
    return res.status(400).send({
      message: "Invalid application status",
    });
  }

  try {
    const result = await applications.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: normalizedStatus,
        },
      }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to update application status",
    });
  }
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




//payments releted apis
app.post("/payment/checkout-verify", async(req, res)=>{
  const {sessionId} = req.body;
  const {
    status,
    payment_email,
    customer_email,
    metadata,
    payment_intent,
  }= await stripe.checkout.sessions.retrieve(sessionId);

  if(status === "complete" && payment_status === "paid"){
     const payment={
    sessionId,
    status,
    payment_status,
    customer_email,
    userid: metadata.userId,
    payment_intent,
    payment_date: new Date(),
  }
  const result = await payments.insertOne(payment);

  const query = {_id: new ObjectId(metadata.userId)};

  const updatedDoc = {
    $set:{
      premium: true,
    }
  }
    const updateResult = await users.updateOne(
      {_id: new ObjectId(metadata.userId)},
      updatedDoc
    );
    res.send({success: true, result, updateResult})
    return
  }

  res.send({success: false, message: "payment verification faild"});
})




// Start Server
app.listen(port, () => {
  console.log(`Mentorlagbe is running on port ${port}`);
});