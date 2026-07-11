import { MongoClient } from "mongodb";

const uri =
  "mongodb+srv://beihang123:trtsdmt1111@cluster0.q7bk7vt.mongodb.net/beihangstartapp?retryWrites=true&w=majority";

const client = new MongoClient(uri);

try {
  console.log("Connecting...");
  await client.connect();

  console.log("✅ Connected!");

  const db = client.db("beihangstartapp");

  const result = await db.collection("test").insertOne({
    createdAt: new Date(),
  });

  console.log("Inserted:", result.insertedId);

  await client.close();

  console.log("✅ Done");
} catch (err) {
  console.error(err);
}