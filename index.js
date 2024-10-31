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
    origin: [
      "http://localhost:5173",
      "https://cashless-sandy.vercel.app"
    ],
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
    const database = client.db("cashlessDB");
    const usersCollection = database.collection("users");
    const cashoutCollection = database.collection("cashout");
    const cashinCollection = database.collection("cashin");
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

    // real-time balance
    app.get("/balance/:userId", authenticateToken, async (req, res) => {
      try {
        const { userId } = req.params;
        const user = await usersCollection.findOne(
          { _id: new ObjectId(userId) },
          { projection: { balance: 1 } }
        );

        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({ balance: user.balance });
      } catch (error) {
        console.error("Error fetching balance:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Transaction-related API endpoints

    // User makes a cash-out request
    app.post("/cashout", authenticateToken, async (req, res) => {
      try {
        const { agentPhone, amount } = req.body;
        const userId = req.user.id;

        const agent = await usersCollection.findOne({ phone: agentPhone });
        if (!agent || agent.role !== "agent") {
          return res.status(404).json({ error: "Agent not found" });
        }

        const user = await usersCollection.findOne({
          _id: new ObjectId(userId),
        });
        if (user.balance < amount) {
          return res.status(400).json({ error: "Insufficient balance" });
        }

        const cashoutRequest = {
          userId: new ObjectId(userId),
          agentPhone,
          amount,
          status: "pending",
          createdAt: new Date(),
        };

        await cashoutCollection.insertOne(cashoutRequest);
        res
          .status(200)
          .json({ message: "Cash-out request created successfully" });
      } catch (error) {
        console.error("Error creating cash-out request:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // User makes a cash-in request
    app.post("/cashin", authenticateToken, async (req, res) => {
      try {
        const { agentPhone, amount } = req.body;
        const userId = req.user.id;

        const agent = await usersCollection.findOne({ phone: agentPhone });
        if (!agent || agent.role !== "agent") {
          return res.status(404).json({ error: "Agent not found" });
        }

        const cashinRequest = {
          userId: new ObjectId(userId),
          agentPhone,
          amount,
          status: "pending",
          createdAt: new Date(),
        };

        await cashinCollection.insertOne(cashinRequest);
        res
          .status(200)
          .json({ message: "Cash-in request created successfully" });
      } catch (error) {
        console.error("Error creating cash-in request:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Send money to another user
    app.post("/sendmoney", authenticateToken, async (req, res) => {
      try {
        const { recipientPhone, amount, pin } = req.body;
        const senderId = req.user.id;

        const intAmount = parseFloat(amount)
        // Validate transaction amount
        if (amount < 50) {
          return res.status(400).json({ error: "Minimum transaction amount is 50 Taka." });
        }

        const sender = await usersCollection.findOne({
          _id: new ObjectId(senderId),
        });
        if (!sender || !bcrypt.compareSync(pin, sender.pin)) {
          return res.status(401).json({ error: "Invalid PIN" });
        }

        const senderBalance = parseFloat(sender.balance);

        if (senderBalance < intAmount) {
          return res.status(400).json({ error: "Insufficient balance" });
        }

        const recipient = await usersCollection.findOne({
          phone: recipientPhone,
        });
        if (!recipient) {
          return res.status(404).json({ error: "Recipient not found" });
        }

        // Calculate the transaction fee
        const transactionFee = intAmount > 100 ? 5 : 0;
        const totalDeduction = intAmount + transactionFee;

        if (senderBalance < totalDeduction) {
          return res.status(400).json({ error: "Insufficient balance for transaction and fee." });
        }

        // Update balances manually without using a session
        await usersCollection.updateOne(
          { _id: new ObjectId(senderId) },
          { $inc: { balance: -totalDeduction } }
        );

        await usersCollection.updateOne(
          { _id: recipient._id },
          { $inc: { balance: intAmount } }
        );

        const transaction = {
          senderId: new ObjectId(senderId),
          recipientId: recipient._id,
          intAmount,
          transactionFee,
          createdAt: new Date(),
        };

        await sendMonyCollection.insertOne(transaction);

        res.status(200).json({ message: "Money sent successfully" });
      } catch (error) {
        console.error("Error sending money:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });


    // Send all cashin requests
    app.get("/cashin", authenticateToken, async (req, res) => {
      try {
        const cashinRequests = await cashinCollection.find().toArray();
        res.status(200).json(cashinRequests);
      } catch (error) {
        console.error("Error fetching cashin requests:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Send all cashout requests
    app.get("/cashout", authenticateToken, async (req, res) => {
      try {
        const cashoutRequests = await cashoutCollection.find().toArray();
        res.status(200).json(cashoutRequests);
      } catch (error) {
        console.error("Error fetching cashout requests:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Approve a cash-in request
    app.post("/cashin/approve/:requestId", authenticateToken, async (req, res) => {
      const { requestId } = req.params;
      const agentId = req.user.id;
    
      let session;
    
      try {
        const request = await cashinCollection.findOne({ _id: new ObjectId(requestId) });
    
        if (!request || request.status !== "pending") {
          return res.status(400).json({ error: "Invalid request" });
        }
    
        session = client.startSession();
        session.startTransaction();
    
        const user = await usersCollection.findOne({ _id: new ObjectId(request.userId) });
        const agent = await usersCollection.findOne({ _id: new ObjectId(agentId) });
    
        if (!user || !agent) {
          await session.abortTransaction();
          return res.status(404).json({ error: "User or agent not found" });
        }
    
        // Update user balance
        const updatedBalance = user.balance + request.amount;
        await usersCollection.updateOne(
          { _id: new ObjectId(request.userId) },
          { $set: { balance: updatedBalance } },
          { session }
        );
    
        // Update request status
        await cashinCollection.updateOne(
          { _id: new ObjectId(requestId) },
          { $set: { status: "approved" } },
          { session }
        );
    
        await session.commitTransaction();
        res.status(200).json({ message: "Cash-in request approved successfully" });
      } catch (error) {
        if (session) {
          await session.abortTransaction();
        }
        console.error("Error approving cash-in request:", error);
        res.status(500).json({ error: "Internal server error" });
      } finally {
        if (session) {
          session.endSession();
        }
      }
    });
    
    // Approve a cash-out request
    app.post(
      "/cashout/approve/:requestId",
      authenticateToken,
      async (req, res) => {
        try {
          const { requestId } = req.params;
          const agentId = req.user.id;

          const request = await cashoutCollection.findOne({
            _id: new ObjectId(requestId),
          });
          if (!request || request.status !== "pending") {
            return res.status(400).json({ error: "Invalid request" });
          }

          const session = client.startSession();
          session.startTransaction();

          try {
            const user = await usersCollection.findOne({
              _id: new ObjectId(request.userId),
            });
            const agent = await usersCollection.findOne({
              _id: new ObjectId(agentId),
            });

            const totalDeduction = request.amount * 1.015;
            if (user.balance < totalDeduction) {
              await session.abortTransaction();
              return res.status(400).json({ error: "Insufficient balance" });
            }

            await usersCollection.updateOne(
              { _id: new ObjectId(request.userId) },
              { $inc: { balance: -totalDeduction } },
              { session }
            );

            await usersCollection.updateOne(
              { _id: new ObjectId(agentId) },
              { $inc: { balance: request.amount * 1.015 } },
              { session }
            );

            await cashoutCollection.updateOne(
              { _id: new ObjectId(requestId) },
              { $set: { status: "approved", approvedAt: new Date() } },
              { session }
            );

            await session.commitTransaction();
            res.status(200).json({ message: "Cash-out approved successfully" });
          } catch (error) {
            await session.abortTransaction();
            console.error("Error approving cash-out:", error);
            res.status(500).json({ error: "Internal server error" });
          } finally {
            session.endSession();
          }
        } catch (error) {
          console.error("Error approving cash-out:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      }
    );

    app.get("/", (req, res) => {
      res.send("Cashless Server!");
    });

    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error(error);
  }
}

run().catch(console.dir);
