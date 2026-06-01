import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import path from 'path'
import authRouter from './google-auth.js';
import microsoftAuthRouter from './microsoft-auth.js';
import cookieParser from 'cookie-parser';


const app = express();

app.use(cookieParser());
app.use(cors());
app.use(express.json());

/*
const frontendPath = path.resolve('../frontend/dist');

app.use(express.static(frontendPath));

app.get('*', (req, res) => {
  res.sendFile(
    path.join(frontendPath, 'index.html')
  );
});
*/

app.use('/google', authRouter);
app.use('/microsoft', microsoftAuthRouter);

const PORT = process.env.PORT || 3000;

console.log(PORT);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
