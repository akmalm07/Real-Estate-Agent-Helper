import { Router } from "express";

const authRouter = Router();

/* This is the route that google will access once the user
 * has accepted the OAuth consent screen and will proceed 
 * to create an access token for them */
authRouter.get('/auth', async (req, res) => {
    
})