# Mobile Financial Service (MFS) Application

This repository contains the code for a basic Mobile Financial Service (MFS) application developed using React.js, Node.js, Express.js, and MongoDB.

### Live URL: [https://cashless-sandy.vercel.app](https://cashless-sandy.vercel.app)
### Server-side code repository: [https://github.com/shahadathhs/cashless-server](https://github.com/shahadathhs/cashless-server)

## Admin Credentials
- Email: admin@gmail.com
- Phone: 123456789
- PIN: 12345

## Installation

To run this project locally, follow these steps:

1. **Clone the repository:**

   ```bash
   git clone https://github.com/shahadathhs/cashless-server.git
   cd cashless-server
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up environment variables:**

   Create a `.env` file in the root directory of the project with the following content:

   ```dotenv
   DB_USER=dummyMaster
   DB_PASS=****************
   ACCESS_TOKEN_SECRET=808750db09ea08dfc8c26ac33c24835d797f78557201d6f4da1fcd92920c0fb46a0ccc27683cf61a39a6217261012481dd2fd50233d1bbe72a4122c7562124fb
   ```

   Adjust `DB_USER`, `DB_PASS`, and `ACCESS_TOKEN_SECRET` values according to your setup. These variables are crucial for your MongoDB connection and JWT token generation.

4. **Run the application:**

   ```bash
   npm start
   ```

   This command starts the development server. Open [http://localhost:5000](http://localhost:5000) to view it in the browser.

---

### Notes:

- Make sure your MongoDB instance is properly configured and accessible.
- Replace placeholder values in `.env` with your actual database credentials and token secrets.
- Ensure CORS and other security configurations are appropriately handled in your Node.js Express server.
- For production deployment, consider setting up environment variables in your hosting platform (like Vercel) or using a `.env.production` file.

This README file provides clear instructions on how to clone, set up, and run your MFS application locally. Adjust and expand it further based on your specific project requirements and setup details.