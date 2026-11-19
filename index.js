import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
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