const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const user = process.env.DB_USER;
const password = process.env.DB_PASS;
const accessToken = process.env.ACCESS_TOKEN_SECRET;

const uri = `mongodb+srv://${user}:${password}@cluster0.ahaugjj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    // await client.connect();

    const database = client.db("cashlessDB");
    const usersCollection = database.collection("users");
    const cashoutCollection = database.collection("cashout");
    const sendMonyCollection = database.collection("sendMoney");

    // JWT-related API endpoints
    const authenticateToken = (req, res, next) => {
      const authHeader = req.headers["authorization"];
      const token = authHeader && authHeader.split(" ")[1];

      if (!token) {
        return res.sendStatus(403);
      }

      jwt.verify(token, accessToken, (err, user) => {
        if (err) {
          return res.sendStatus(403);
        }

        req.user = user;
        next();
      });
    };

    // USERS-related API endpoints
    // Register an account
    app.post("/register", async (req, res) => {
      try {
        const { name, pin, phone, email, role } = req.body;

        // Validate that the PIN is exactly 5 digits
        if (!/^\d{5}$/.test(pin)) {
          return res
            .status(400)
            .json({ error: "PIN must be exactly 5 digits." });
        }

        // Hash the PIN before saving it
        const hashedPin = await bcrypt.hash(pin, 10);

        const user = {
          name,
          pin: hashedPin,
          phone,
          email,
          role,
          status: "pending",
          balance: 0,
        };

        await usersCollection.insertOne(user);

        res.status(200).json({ message: "User registered successfully" });
      } catch (error) {
        console.error("Error registering user:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Login into account and sending user details
    app.post("/login", async (req, res) => {
      try {
        const { identifier, pin } = req.body;
        const user = await usersCollection.findOne({
          $or: [{ email: identifier }, { phone: identifier }],
        });

        if (!user) {
          return res.status(401).json({ error: "Invalid credentials" });
        }

        const isPinValid = await bcrypt.compare(pin, user.pin);
        if (!isPinValid) {
          return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign({ id: user._id, role: user.role }, accessToken, {
          expiresIn: "1h",
        });

        res.status(200).json({ token, user });
      } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Get all users (Admin only)
    app.get("/users", authenticateToken, async (req, res) => {
      try {
        if (req.user.role !== "admin") {
          return res.status(403).json({ error: "Access denied" });
        }
        const users = await usersCollection.find().toArray();
        res.status(200).json(users);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Search users by name (Admin only)
    app.get("/users/search", authenticateToken, async (req, res) => {
      try {
        if (req.user.role !== "admin") {
          return res.status(403).json({ error: "Access denied" });
        }
        const { name } = req.query;
        const users = await usersCollection
          .find({ name: { $regex: name, $options: "i" } })
          .toArray();
        res.status(200).json(users);
      } catch (error) {
        console.error("Error searching users:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Update user status (Activate/Block) (Admin only)
    app.post("/users/:userId", authenticateToken, async (req, res) => {
      try {
        const { userId } = req.params;
        const { status } = req.body;

        const user = await usersCollection.findOne({
          _id: new ObjectId(userId),
        });

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        let bonus = 0;
        if (status === "active") {
          bonus = user.role === "agent" ? 10000 : 40;
        }

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { status, balance: user.balance + bonus } }
        );

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .json({ error: "User not found or status not updated" });
        }

        res
          .status(200)
          .json({ message: "User status and balance updated successfully" });
      } catch (error) {
        console.error("Error updating user status and balance:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // POST endpoint for cash-out
    app.post("/cashout", authenticateToken, async (req, res) => {
      try {
        const { amount, pin, phone, agentPhone } = req.body;

        // Verify PIN (example: using bcrypt for hashing and comparing)
        const user = await usersCollection.findOne({ phone });
        if (!user || !bcrypt.compareSync(pin, user.pin)) {
          return res.status(401).json({ error: "Invalid PIN" });
        }
        const intAmount = parseInt(amount);
        // Store cash-out request (adjust based on your DB schema)
        const result = await cashoutCollection.insertOne({
          userId: user._id,
          amount: intAmount,
          agentPhone,
          status: "pending", // Example: you might want to track status
          createdAt: new Date(),
        });

        if (!result.insertedId) {
          return res
            .status(500)
            .json({ error: "Failed to store cash-out request" });
        }

        // Respond with success message
        res
          .status(200)
          .json({ message: "Cash-out request stored successfully" });
      } catch (error) {
        console.error("Error during cash-out:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // POST endpoint for sending money
    app.post("/sendmoney", authenticateToken, async (req, res) => {
      try {
        const { amount, pin, senderPhone, receiverPhone } = req.body;

        console.log("Received send money request:", {
          amount,
          pin,
          senderPhone,
          receiverPhone,
        });

        // Verify PIN
        const sender = await usersCollection.findOne({ phone: senderPhone });
        if (!sender) {
          console.log("Sender not found");
          return res.status(404).json({ error: "Sender not found" });
        }
        if (!bcrypt.compareSync(pin, sender.pin)) {
          console.log("Invalid PIN");
          return res.status(401).json({ error: "Invalid PIN" });
        }

        const amountNumber = parseFloat(amount);
        if (amountNumber < 50) {
          console.log("Transaction amount less than 50 Taka");
          return res
            .status(400)
            .json({ error: "Minimum transaction amount is 50 Taka." });
        }

        // Calculate fee
        const fee = amountNumber > 100 ? 5 : 0;
        const totalAmount = amountNumber + fee;

        // Check sender balance
        if (sender.balance < totalAmount) {
          console.log("Insufficient balance");
          return res.status(400).json({ error: "Insufficient balance." });
        }

        // Find receiver
        const receiver = await usersCollection.findOne({
          phone: receiverPhone,
        });
        if (!receiver) {
          console.log("Receiver not found");
          return res.status(404).json({ error: "Receiver not found." });
        }

        // Perform transaction
        await usersCollection.updateOne(
          { _id: sender._id },
          { $inc: { balance: -totalAmount } }
        );

        await usersCollection.updateOne(
          { _id: receiver._id },
          { $inc: { balance: amountNumber } }
        );

        // Store transaction details
        await sendMonyCollection.insertOne({
          senderId: sender._id,
          receiverId: receiver._id,
          amount: amountNumber,
          fee,
          createdAt: new Date(),
        });

        console.log("Transaction successful");
        res.status(200).json({ message: "Money sent successfully." });
      } catch (error) {
        console.error("Error during transaction:", error);
        res.status(500).json({ error: "Internal server error." });
      }
    });

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
  res.send("Cashless Server Running!");
});

app.listen(port, () => {
  console.log(`Cashless Server listening on port ${port}`);
});
