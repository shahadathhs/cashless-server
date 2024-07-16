const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;

//middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const user = process.env.DB_USER
const password = process.env.DB_PASS

const uri = `mongodb+srv://${user}:${password}@cluster0.ahaugjj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const database = client.db("cashlessDB");
    
    
    // Middleware to verify token for private routes
    const verifyToken = async (req, res, next) => {
      // Extract the token from cookies
      const token = req.cookies?.token;
      console.log("middleware token", token);

      // If token is not available, return Unauthorized status
      if (!token) {
        return res.status(401).send({ message: "Unauthorized" });
      }

      // If token is available, verify it
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
          // If verification fails, return Forbidden status
          return res.status(403).send({ message: "Forbidden" });
        }
        // If verification succeeds, attach the decoded token to the request object
        req.decodedToken = decoded;
        // Proceed to the next middleware or route handler
        next();
      });
    };

    // Middleware to verify admin access for admin routes
    const verifyAdmin = async (req, res, next) => {
      // Extract the email from the decoded token
      const email = req.decodedToken.email;
      // Construct a query to find the user by email
      const query = { email: email };
      // Fetch the user from the database
      const user = await usersCollection.findOne(query);
      // Check if the user's role is "admin"
      const isAdmin = user?.role === "admin";

      // If the user is not an admin, return Forbidden status
      if (!isAdmin) {
        return res.status(403).send({ message: "Forbidden" });
      }

      // If the user is an admin, proceed to the next middleware or route handler
      next();
    };

    // Define cookie options
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    };

    // JWT-related API endpoints

    // Endpoint to create and send a JWT token
    app.post("/jwt", async (req, res) => {
      const userEmail = req.body;
      console.log("user for token", userEmail);
      // Create a token using the userEmail and a secret key
      const token = jwt.sign(userEmail, process.env.ACCESS_TOKEN_SECRET);
      // Set the token in a cookie with the specified options
      res.cookie("token", token, cookieOptions).send({ loginSuccess: true });
    });
    // Endpoint to clear the JWT token
    app.post("/logout", async (req, res) => {
      const userEmail = req.body;
      console.log("logging out", userEmail);
      // Clear the token cookie
      res.clearCookie("token", { ...cookieOptions, maxAge: 0 }).send({ logoutSuccess: true });
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // Get the database and collection on which to run the operation
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Cashless Server Running!')
})

app.listen(port, () => {
  console.log(`Cashless Server listening on port ${port}`)
})