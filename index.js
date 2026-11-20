import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';


const app = express()
const port = process.env.PORT || 5000

//middleware
app.use(express.json())
app.use(cors());


//mongodb connection
const client = new MongoClient(process.env.MONGODB_URL);
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}
const connectedClient = await connectToMongoDB();
const database = client.db("mentorlagbe")
const users = database.collection("user")
const tuitions = database.collection("tuitions")
const applications = database.collection("appliactions")


app.get("/", (req, res)=>{
    res.send("Mentorlagbe is running")
})


app.get("/users", async (req, res)=>{
    const cursor = users.find({});
    const result = await cursor.toArray();
    res.send(result)
})



//tuition related apis

app.post("/tuitions", async (req, res) => {
  try {
    const tuitionData = req.body;

    const result = await tuitions.insertOne(tuitionData);

    res.status(201).send({
      success: true,
      message: "Tuition posted successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Tuition posting error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to post tuition",
    });
  }
});



app.get("/tuitions",async (req, res)=>{
  const cursor = tuitions.find();
  const result = await cursor.toArray();

  res.send(result);
})


//tuition details 
app.get("/tuitions/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid tuition ID",
      });
    }

    const query = {
      _id: new ObjectId(id),
    };

    const result = await tuitions.findOne(query);

    if (!result) {
      return res.status(404).send({
        message: "Tuition not found",
      });
    }

    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({
      message: "Failed to fetch tuition",
    });
  }
});



app.post("/applications", async (req, res)=>{
  const application = req.body;
  const result = await applications.insertOne(application);
  res.send(result);
})


//list applications (optionally filtered by student)
app.get("/applications", async (req, res) => {
  try {
    const { userId } = req.query;
    const match = userId ? { userId } : {};

    const result = await applications
      .aggregate([
        { $match: match },
        {
          $addFields: {
            tuitionObjectId: {
              $convert: {
                input: "$tuitionId",
                to: "objectId",
                onError: null,
                onNull: null,
              },
            },
          },
        },
        {
          $lookup: {
            from: "tuitions",
            localField: "tuitionObjectId",
            foreignField: "_id",
            as: "tuition",
          },
        },
        { $unwind: { path: "$tuition", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "user",
            localField: "tuition.tutorEmail",
            foreignField: "email",
            as: "tutor",
          },
        },
        { $unwind: { path: "$tutor", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            tuitionTitle: { $ifNull: ["$tuitionTitle", "$tuition.title"] },
            classLevel: { $ifNull: ["$classLevel", "$tuition.classLevel"] },
            monthlyFee: "$tuition.budget",
            tutorName: "$tutor.name",
            tutorEmail: { $ifNull: ["$tuition.tutorEmail", "$tutor.email"] },
          },
        },
        { $project: { tuition: 0, tutor: 0, tuitionObjectId: 0 } },
        { $sort: { appliedDate: -1, _id: -1 } },
      ])
      .toArray();

    res.send(result);
  } catch (error) {
    console.error("Applications fetch error:", error);
    res.status(500).send({
      message: "Failed to fetch applications",
    });
  }
});


app.get("/applications/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // Check valid MongoDB ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid application ID",
      });
    }

    // Find application by ID
    const query = {
      _id: new ObjectId(id),
    };

    const result = await applications.findOne(query);

    // Check application exists
    if (!result) {
      return res.status(404).send({
        message: "Application not found",
      });
    }

    res.status(200).send(result);
  } catch (error) {
    console.error("Application fetch error:", error);

    res.status(500).send({
      message: "Failed to fetch application",
    });
  }
});


//cancel/delete a pending application
app.delete("/applications/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid application ID",
      });
    }

    const { userId } = req.query;
    const query = { _id: new ObjectId(id) };

    if (userId) {
      query.userId = userId;
    }

    const application = await applications.findOne(query);

    if (!application) {
      return res.status(404).send({
        message: "Application not found",
      });
    }

    const status = String(application.status || "Pending").toLowerCase();

    if (status !== "pending") {
      return res.status(409).send({
        message: "Only pending applications can be cancelled",
      });
    }

    const result = await applications.deleteOne(query);

    res.send(result);
  } catch (error) {
    console.error("Application cancel error:", error);

    res.status(500).send({
      message: "Failed to cancel application",
    });
  }
});


//delete tuition
app.delete('/tuitions/:id', async (req, res)=>{

  const id = req.params.id;
  const query = {_id: new ObjectId(id)};
  const result = await jobs.deleteOne(query);
  res.send(result);
})


//update tuition.
app.put("/tuitions/:id", async (req, res) => {
  const id = req.params.id;
  const updatedData = req.body;

  const result = await tuitions.updateOne(
    { _id: new ObjectId(id) },
    { $set: updatedData }
  );

  res.send(result);
});


app.listen(port, ()=>{
    console.log(`mentorlagbe is running on port ${port}`)
})