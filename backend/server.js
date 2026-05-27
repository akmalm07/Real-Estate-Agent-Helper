import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  console.log("got connected!");
  res.send("Hello from backend");
});

const PORT = process.env.PORT || 3000;

console.log(PORT);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});