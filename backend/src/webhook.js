import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';

const googleOAuthClient = new OAuth2Client();

const webhookRouter = Router();

const pubSubServiceAcc = process.env.GOOGLE_PUB_SUB_AUTH_SERVICE_ACCOUNT;
const pubSubAudience = process.env.PUB_SUB_AUDIENCE;
/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/


async function verifyPubSubToken(token) {
  const ticket = await googleOAuthClient.verifyIdToken({
    idToken: token,
    audience: pubSubAudience,
  });

  return ticket.getPayload();
}


/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/


webhookRouter.post('/gmail', async (req, res) => {
  try {
    const auth = req.headers.authorization;

    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).send('Unauthorized');
    }

    const token = auth.substring(7);

    const payload = await verifyPubSubToken(token);

    // Optional: verify service account email
    console.log(payload.email);

    if (payload.email !== pubSubServiceAcc) {
      return res.sendStatus(401);
    }

    console.log('/n/n YOOOOO I GOT AN EMAIL!!!! /n/n')
    // Process Pub/Sub message

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(401);
  }
});


export default webhookRouter;