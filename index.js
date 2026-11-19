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
const tutions = database.collection("tutions")


app.get("/", (req, res)=>{
    res.send("Mentorlagbe is running")
})


app.get("/users", async (req, res)=>{
    const cursor = users.find({});
    const result = await cursor.toArray();
    res.send(result)
})

app.listen(port, ()=>{
    console.log(`mentorlagbe is running on port ${port}`)
})