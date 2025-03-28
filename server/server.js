require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2");
const { google } = require("googleapis");
const cors = require("cors");
const admin = require("firebase-admin");
const fs = require("fs");
const { dirname } = require("path");

const app = express();
const PORT = process.env.PORT || 5000;


app.use(express.json());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));

const serviceAccount = require(`${__dirname}/${process.env.FIREBASE_ADMIN_SDK_PATH}`);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});


const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});
db.connect((err) => {
  if (err) console.error("DB Connection Error:", err);
  else console.log("Connected to MySQL");
});


const verifyFirebaseToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) return res.status(401).json({ message: "No token provided" });

    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken; // Attach user info to request
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized", error: error.message });
  }
};


app.post("/letters", verifyFirebaseToken, (req, res) => {
  const { title, content } = req.body;
  const email = req.user.email;

  db.query("INSERT INTO letters (email, title, content) VALUES (?, ?, ?)", [email, title, content], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Letter saved successfully!" });
  });
});


app.get("/letters", verifyFirebaseToken, (req, res) => {
  const email = req.user.email;
  db.query("SELECT * FROM letters WHERE email = ?", [email], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// const oauth2Client = new google.auth.OAuth2(
//   process.env.GOOGLE_CLIENT_ID,
//   process.env.GOOGLE_CLIENT_SECRET,
//   process.env.SERVER_URL + "/google-drive/callback"
// );
// const drive = google.drive({ version: "v3", auth: oauth2Client });


app.post("/google-drive/upload", verifyFirebaseToken, async (req, res) => {
  try {

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        
        process.env.SERVER_URL + "/google-drive/callback"
    );
   
    oauth2Client.setCredentials({ access_token: req.headers["X-Access-Token"] });
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    const { title, content } = req.body;
    const fileMetadata = { name: `${title}.txt`, mimeType: "text/plain" };
    const media = { mimeType: "text/plain", body: content };

    const file = await drive.files.create({ resource: fileMetadata, media, fields: "id" });
    res.json({ fileId: file.data.id, message: "File uploaded successfully to Google Drive!" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

// Server Listen
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
